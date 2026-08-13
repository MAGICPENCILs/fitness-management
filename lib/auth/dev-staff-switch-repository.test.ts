import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  type TargetState = {
    id: number;
    role: "OWNER" | "MANAGER" | "COUNTER" | "TRAINER";
    homeBranchId: number;
    staffStatus: "ACTIVE" | "INACTIVE";
    branchStatus: "ACTIVE" | "INACTIVE";
  };
  const baseCurrent = () => ({
    staffId: 1,
    currentStaffId: 1,
    currentStaffStatus: "ACTIVE" as "ACTIVE" | "INACTIVE",
    currentHomeBranchId: 1,
    currentBranchStatus: "ACTIVE" as "ACTIVE" | "INACTIVE",
    mode: "FULL" as const,
    revokedAt: null as Date | null,
    absoluteExpiresAt: new Date("2026-08-11T14:00:00.000Z"),
    idleExpiresAt: new Date("2026-08-11T06:30:00.000Z"),
  });
  const baseTarget = (): TargetState => ({
    id: 3,
    role: "COUNTER" as const,
    homeBranchId: 2,
    staffStatus: "ACTIVE" as const,
    branchStatus: "ACTIVE" as const,
  });
  const state = {
    current: baseCurrent(),
    target: baseTarget(),
    createdSessions: [] as Array<Record<string, unknown>>,
    audits: [] as Array<Record<string, unknown>>,
  };
  const locks: string[] = [];
  let affectedRows = 1;
  let failAudit = false;

  const clone = () => ({
    current: { ...state.current },
    target: { ...state.target },
    createdSessions: state.createdSessions.map((row) => ({ ...row })),
    audits: state.audits.map((row) => ({ ...row })),
  });

  function executor(working: ReturnType<typeof clone>) {
    let insertCount = 0;
    return {
      select: vi.fn((selection: Record<string, unknown>) => {
        const kind = "mode" in selection ? "current" : "target";
        const chain = {
          from: vi.fn(), innerJoin: vi.fn(), where: vi.fn(), limit: vi.fn(),
          for: vi.fn(async () => {
            locks.push(kind);
            return [kind === "current" ? { ...working.current } : { ...working.target }];
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
            if (affectedRows === 0) return [{ affectedRows: 0 }];
            working.current = { ...working.current, ...values } as typeof working.current;
            return [{ affectedRows: 1 }];
          }),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(async (values: Record<string, unknown>) => {
          insertCount += 1;
          if (insertCount === 1) working.createdSessions.push({ ...values });
          else {
            if (failAudit) throw new Error("AUDIT_WRITE_FAILED");
            working.audits.push({ ...values });
          }
        }),
      })),
    };
  }

  const db = {
    transaction: vi.fn(async <T>(callback: (tx: ReturnType<typeof executor>) => Promise<T>) => {
      const working = clone();
      const result = await callback(executor(working));
      state.current = working.current;
      state.target = working.target;
      state.createdSessions = working.createdSessions;
      state.audits = working.audits;
      return result;
    }),
  };

  return {
    db, state, locks,
    reset() {
      state.current = baseCurrent();
      state.target = baseTarget();
      state.createdSessions = [];
      state.audits = [];
      locks.length = 0;
      affectedRows = 1;
      failAudit = false;
      vi.clearAllMocks();
    },
    setAffectedRows(value: number) { affectedRows = value; },
    setFailAudit(value: boolean) { failAudit = value; },
  };
});

vi.mock("@/db", () => ({ db: database.db }));

import { DrizzleDevStaffSwitchRepository } from "@/lib/auth/dev-staff-switch";

const occurredAt = new Date("2026-08-11T06:00:00.000Z");
const input = {
  currentAuthSessionId: 41,
  currentStaffId: 1,
  currentBranchId: 1,
  targetStaffId: 3,
  occurredAt,
  newSession: {
    sessionTokenHash: "stored-hash",
    mode: "FULL" as const,
    createdAt: occurredAt,
    lastSeenAt: occurredAt,
    absoluteExpiresAt: new Date("2026-08-11T14:00:00.000Z"),
    idleExpiresAt: new Date("2026-08-11T06:30:00.000Z"),
    ipFingerprint: null,
    userAgentCategory: "UNKNOWN" as const,
  },
  sign: vi.fn(async (target) => ({
    claims: {
      sessionId: "new-session",
      staffId: target.id,
      role: target.role,
      homeBranchId: target.homeBranchId,
      mode: "FULL" as const,
      expiresAt: 1786456800,
    },
    sessionCookie: "signed-cookie",
  })),
};

describe("Drizzle development Staff rotation boundary", () => {
  beforeEach(() => database.reset());

  it("locks current/target and writes target FULL session plus safe old-actor audit atomically", async () => {
    await new DrizzleDevStaffSwitchRepository().rotate(input);

    expect(database.locks).toEqual(["current", "target"]);
    expect(database.state.current).toMatchObject({
      revokedAt: occurredAt,
      revokedReason: "ADMIN_REVOKED",
    });
    expect(database.state.createdSessions).toEqual([
      expect.objectContaining({ staffId: 3, mode: "FULL", sessionTokenHash: "stored-hash" }),
    ]);
    expect(database.state.audits).toEqual([
      expect.objectContaining({
        actorStaffId: 1,
        branchId: 1,
        action: "DEV_STAFF_CONTEXT_CHANGED",
        entityType: "STAFF",
        entityId: 3,
        metadata: { source: "DEV_STAFF_SWITCHER", branchId: 2 },
      }),
    ]);
    expect(JSON.stringify(database.state.audits)).not.toMatch(/stored-hash|OWNER001/);
  });

  it("rejects a current Staff deactivated after authentication before any write", async () => {
    database.state.current.currentStaffStatus = "INACTIVE";
    await expect(new DrizzleDevStaffSwitchRepository().rotate(input)).rejects.toMatchObject({ status: 401 });
    expect(database.state.current.revokedAt).toBeNull();
    expect(database.state.createdSessions).toEqual([]);
    expect(database.state.audits).toEqual([]);
  });

  it("rejects a current Staff whose locked home branch changed after authentication", async () => {
    database.state.current.currentHomeBranchId = 2;
    await expect(new DrizzleDevStaffSwitchRepository().rotate(input)).rejects.toMatchObject({ status: 401 });
    expect(database.state.current.revokedAt).toBeNull();
    expect(database.state.createdSessions).toEqual([]);
    expect(database.state.audits).toEqual([]);
  });

  it("does not revoke, insert, or audit when signing fails inside the transaction", async () => {
    const sign = vi.fn(async () => { throw new Error("SESSION_SECRET unavailable"); });
    await expect(new DrizzleDevStaffSwitchRepository().rotate({ ...input, sign })).rejects.toThrow("SESSION_SECRET unavailable");
    expect(database.state.current.revokedAt).toBeNull();
    expect(database.state.createdSessions).toEqual([]);
    expect(database.state.audits).toEqual([]);
  });

  it.each(["staffStatus", "branchStatus"] as const)("rejects inactive target %s before revoke/create/audit", async (field) => {
    database.state.target[field] = "INACTIVE";
    await expect(new DrizzleDevStaffSwitchRepository().rotate(input)).rejects.toMatchObject({ status: 404 });
    expect(database.state.current.revokedAt).toBeNull();
    expect(database.state.createdSessions).toEqual([]);
    expect(database.state.audits).toEqual([]);
  });

  it("rotates and audits even when development selects the current Staff", async () => {
    database.state.target = {
      id: 1,
      role: "OWNER",
      homeBranchId: 1,
      staffStatus: "ACTIVE",
      branchStatus: "ACTIVE",
    };
    await new DrizzleDevStaffSwitchRepository().rotate({ ...input, targetStaffId: 1 });
    expect(database.state.createdSessions[0]).toMatchObject({ staffId: 1, mode: "FULL" });
    expect(database.state.audits[0]).toMatchObject({ actorStaffId: 1, entityId: 1 });
  });

  it("treats affectedRows zero as concurrent conflict without creating or auditing", async () => {
    database.setAffectedRows(0);
    await expect(new DrizzleDevStaffSwitchRepository().rotate(input)).rejects.toMatchObject({ status: 409 });
    expect(database.state.current.revokedAt).toBeNull();
    expect(database.state.createdSessions).toEqual([]);
    expect(database.state.audits).toEqual([]);
  });

  it("rolls back revoke and target session when audit write fails", async () => {
    database.setFailAudit(true);
    await expect(new DrizzleDevStaffSwitchRepository().rotate(input)).rejects.toThrow("AUDIT_WRITE_FAILED");
    expect(database.state.current.revokedAt).toBeNull();
    expect(database.state.createdSessions).toEqual([]);
    expect(database.state.audits).toEqual([]);
  });
});
