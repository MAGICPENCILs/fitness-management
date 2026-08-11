import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  type StaffSubject = {
    id: number;
    staffCode: string;
    role: "OWNER" | "MANAGER" | "COUNTER" | "TRAINER";
    homeBranchId: number;
  };
  type State = {
    session: {
      id: number;
      staffId: number;
      role: StaffSubject["role"];
      homeBranchId: number;
      revokedAt: Date | null;
      revokedReason: string | null;
    } | null;
    limit: {
      id: number;
      scope: "ACCOUNT" | "IP";
      subjectHash: string;
      attemptCount: number;
      lockedUntil: Date | null;
      windowStartedAt: Date;
      updatedAt: Date;
    } | null;
    staffSubjects: StaffSubject[];
    audits: Array<Record<string, unknown>>;
  };

  const state: State = {
    session: null,
    limit: null,
    staffSubjects: [],
    audits: [],
  };
  const forUpdateKinds: string[] = [];
  let updateAffectedRows = 1;
  let failAudit = false;

  const clone = (): State => ({
    session: state.session ? { ...state.session } : null,
    limit: state.limit ? { ...state.limit } : null,
    staffSubjects: state.staffSubjects.map((row) => ({ ...row })),
    audits: state.audits.map((row) => ({ ...row })),
  });

  function executor(working: State) {
    return {
      select: vi.fn((selection: Record<string, unknown>) => {
        const kind = "subjectHash" in selection
          ? "limit"
          : "revokedAt" in selection
            ? "session"
            : "staffCode" in selection
              ? "staffSubjects"
              : "staff";
        const chain = {
          from: vi.fn(),
          innerJoin: vi.fn(),
          where: vi.fn(),
          limit: vi.fn(),
          for: vi.fn(async () => {
            forUpdateKinds.push(kind);
            if (kind === "limit") return working.limit ? [{ ...working.limit }] : [];
            if (kind === "session") return working.session ? [{ ...working.session }] : [];
            if (kind === "staffSubjects") return working.staffSubjects.map((row) => ({ ...row }));
            const target = working.staffSubjects[0];
            return target ? [{ ...target }] : [];
          }),
        };
        chain.from.mockReturnValue(chain);
        chain.innerJoin.mockReturnValue(chain);
        chain.where.mockReturnValue(chain);
        chain.limit.mockReturnValue(chain);
        return chain;
      }),
      update: vi.fn(() => ({
        set: vi.fn((values: Record<string, unknown>) => ({
          where: vi.fn(async () => {
            if (updateAffectedRows === 0) return [{ affectedRows: 0 }];
            if ("attemptCount" in values && working.limit) {
              const dirty = working.limit.attemptCount > 0 || working.limit.lockedUntil !== null;
              if (!dirty) return [{ affectedRows: 0 }];
              working.limit = { ...working.limit, ...values } as State["limit"];
              return [{ affectedRows: 1 }];
            }
            if ("revokedReason" in values && working.session) {
              working.session = { ...working.session, ...values } as NonNullable<State["session"]>;
            }
            return [{ affectedRows: updateAffectedRows }];
          }),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(async (values: Record<string, unknown>) => {
          if (failAudit) throw new Error("AUDIT_WRITE_FAILED");
          working.audits.push({ ...values });
        }),
      })),
    };
  }

  const db = {
    transaction: vi.fn(async <T>(callback: (tx: ReturnType<typeof executor>) => Promise<T>) => {
      const working = clone();
      const result = await callback(executor(working));
      state.session = working.session;
      state.limit = working.limit;
      state.staffSubjects = working.staffSubjects;
      state.audits = working.audits;
      return result;
    }),
  };

  return {
    db,
    state,
    forUpdateKinds,
    reset(input?: Partial<State>) {
      state.session = input?.session ?? {
        id: 11,
        staffId: 3,
        role: "COUNTER",
        homeBranchId: 2,
        revokedAt: null,
        revokedReason: null,
      };
      state.limit = input?.limit ?? null;
      state.staffSubjects = input?.staffSubjects ?? [];
      state.audits = [];
      forUpdateKinds.length = 0;
      updateAffectedRows = 1;
      failAudit = false;
      vi.clearAllMocks();
    },
    setAffectedRows(value: number) { updateAffectedRows = value; },
    setFailAudit(value: boolean) { failAudit = value; },
  };
});

vi.mock("@/db", () => ({ db: database.db }));

import {
  DrizzleSecurityRepository,
  SecurityOperationError,
} from "@/lib/auth/security-service";
import { createAuthSubjectFingerprint } from "@/lib/auth/request-security";

const owner = { staffId: 1, role: "OWNER" as const, homeBranchId: 1 };
const manager = { staffId: 2, role: "MANAGER" as const, homeBranchId: 2 };
const occurredAt = new Date("2026-08-10T12:00:00.000Z");

describe("Drizzle security mutation boundary", () => {
  beforeEach(() => {
    process.env.AUTH_FINGERPRINT_SECRET = "test-fingerprint-secret-that-is-at-least-32-bytes";
    database.reset();
  });

  it("ล็อก session ด้วย SELECT FOR UPDATE และ affectedRows=0 ไม่เขียน audit", async () => {
    database.setAffectedRows(0);
    const repository = new DrizzleSecurityRepository();

    await repository.revokeSessionWithAudit({ actor: owner, sessionId: 11, occurredAt });

    expect(database.forUpdateKinds).toContain("session");
    expect(database.state.session?.revokedAt).toBeNull();
    expect(database.state.audits).toEqual([]);
  });

  it("audit failure ถูก propagate และ rollback session update", async () => {
    database.setFailAudit(true);
    const repository = new DrizzleSecurityRepository();

    await expect(
      repository.revokeSessionWithAudit({ actor: owner, sessionId: 11, occurredAt }),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");
    expect(database.state.session?.revokedAt).toBeNull();
    expect(database.state.audits).toEqual([]);
  });

  it.each([
    ["known ACCOUNT", "ACCOUNT" as const, true, 2],
    ["unmatched ACCOUNT", "ACCOUNT" as const, false, null],
    ["IP", "IP" as const, false, null],
  ])("Owner clear %s ใช้ branch ของ target หรือ null ตาม attribution", async (_label, scope, matched, expectedBranchId) => {
    const staffCode = "CTR003";
    database.reset({
      limit: {
        id: 21,
        scope,
        subjectHash: matched
          ? createAuthSubjectFingerprint(staffCode)
          : "c".repeat(64),
        attemptCount: 5,
        lockedUntil: occurredAt,
        windowStartedAt: new Date("2026-08-10T11:40:00.000Z"),
        updatedAt: new Date("2026-08-10T11:55:00.000Z"),
      },
      staffSubjects: matched
        ? [{ id: 3, staffCode, role: "COUNTER", homeBranchId: 2 }]
        : [],
    });
    const repository = new DrizzleSecurityRepository();

    await repository.clearLimitWithAudit({ actor: owner, limitId: 21, occurredAt });

    expect(database.forUpdateKinds).toContain("limit");
    expect(database.state.limit).toMatchObject({ attemptCount: 0, lockedUntil: null });
    expect(database.state.audits).toEqual([
      expect.objectContaining({
        branchId: expectedBranchId,
        action: "AUTH_RATE_LIMIT_CLEARED",
      }),
    ]);
  });

  it("clear bucket ที่สะอาดแล้วเป็น no-op และไม่เขียน audit", async () => {
    database.reset({
      limit: {
        id: 21,
        scope: "IP",
        subjectHash: "d".repeat(64),
        attemptCount: 0,
        lockedUntil: null,
        windowStartedAt: occurredAt,
        updatedAt: occurredAt,
      },
    });
    const repository = new DrizzleSecurityRepository();

    await repository.clearLimitWithAudit({ actor: owner, limitId: 21, occurredAt });
    expect(database.state.audits).toEqual([]);
  });

  it.each([
    ["unmatched ACCOUNT", "ACCOUNT" as const, []],
    ["IP", "IP" as const, []],
    ["Owner target", "ACCOUNT" as const, [{ id: 1, staffCode: "OWNER001", role: "OWNER" as const, homeBranchId: 2 }]],
    ["out-of-branch target", "ACCOUNT" as const, []],
  ])("Manager ถูกปฏิเสธ %s ภายใน locked transaction", async (_label, scope, staffSubjects) => {
    const subjectHash = staffSubjects[0]
      ? createAuthSubjectFingerprint(staffSubjects[0].staffCode)
      : "e".repeat(64);
    database.reset({
      limit: {
        id: 21,
        scope,
        subjectHash,
        attemptCount: 5,
        lockedUntil: occurredAt,
        windowStartedAt: occurredAt,
        updatedAt: occurredAt,
      },
      staffSubjects,
    });
    const repository = new DrizzleSecurityRepository();

    await expect(
      repository.clearLimitWithAudit({ actor: manager, limitId: 21, occurredAt }),
    ).rejects.toBeInstanceOf(SecurityOperationError);
    expect(database.state.limit?.attemptCount).toBe(5);
    expect(database.state.audits).toEqual([]);
  });
});
