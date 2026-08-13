import { beforeEach, describe, expect, it } from "vitest";

import type { SessionClaims } from "@/lib/auth/types";
import {
  createSessionService,
  SessionAuthenticationError,
  shouldTouchSession,
  validateStoredSession,
  type ExpireSessionInput,
  type SessionRepository,
  type StoredSessionRow,
  type TouchSessionInput,
} from "@/lib/auth/session-service";

const NOW = new Date("2026-08-10T04:30:00.000Z");
const TOKEN_HASH = "a".repeat(64);

const validFixture: StoredSessionRow = {
  authSessionId: 41,
  sessionTokenHash: TOKEN_HASH,
  staffId: 1,
  staffCode: "OWNER001",
  firstName: "สมชาย",
  lastName: "ใจดี",
  role: "OWNER",
  homeBranchId: 1,
  branchName: "สาขาหลัก",
  staffStatus: "ACTIVE",
  branchStatus: "ACTIVE",
  mode: "FULL",
  revokedAt: null,
  absoluteExpiresAt: new Date("2026-08-10T12:00:00.000Z"),
  idleExpiresAt: new Date("2026-08-10T05:00:00.000Z"),
  lastSeenAt: new Date("2026-08-10T04:26:00.000Z"),
};

const validClaims: SessionClaims = {
  sessionId: "raw-session-id",
  staffId: 1,
  role: "OWNER",
  homeBranchId: 1,
  mode: "FULL",
  expiresAt: Math.floor(validFixture.absoluteExpiresAt.getTime() / 1_000),
};

class FakeSessionRepository implements SessionRepository {
  row: StoredSessionRow | null = { ...validFixture };
  expiredAudits: ExpireSessionInput[] = [];
  touches: TouchSessionInput[] = [];

  async findByTokenHash(): Promise<StoredSessionRow | null> {
    return this.row;
  }

  async expireSessionAndAudit(input: ExpireSessionInput): Promise<void> {
    if (this.row && this.row.authSessionId === input.authSessionId) {
      this.row = { ...this.row, revokedAt: input.occurredAt };
    }
    this.expiredAudits.push(input);
  }

  async touchSession(input: TouchSessionInput): Promise<void> {
    if (this.row && this.row.authSessionId === input.authSessionId) {
      this.row = {
        ...this.row,
        lastSeenAt: input.lastSeenAt,
        idleExpiresAt: input.idleExpiresAt,
      };
    }
    this.touches.push(input);
  }
}

function createFixtureService(
  repository: SessionRepository,
  claims: SessionClaims | null = validClaims,
) {
  return createSessionService({
    readSessionCookie: async () => "signed-cookie",
    verifyClaims: async () => claims,
    hashSessionId: () => TOKEN_HASH,
    repository,
    now: () => NOW,
  });
}

describe("stored session validation", () => {
  it("คืน Staff จาก session ที่ active และยังไม่หมดอายุ", () => {
    expect(validateStoredSession(validFixture, NOW)).toMatchObject({
      authSessionId: 41,
      staffId: 1,
      role: "OWNER",
      homeBranchId: 1,
      mode: "FULL",
    });
  });

  it("ปฏิเสธ session ที่ถูก revoke แล้ว", () => {
    expect(() =>
      validateStoredSession({ ...validFixture, revokedAt: NOW }, NOW),
    ).toThrowError(SessionAuthenticationError);
  });

  it.each([
    ["absolute", { absoluteExpiresAt: NOW }],
    ["idle", { idleExpiresAt: NOW }],
  ])("ปฏิเสธ session ที่หมดอายุแบบ %s", (_kind, expiry) => {
    expect(() =>
      validateStoredSession({ ...validFixture, ...expiry }, NOW),
    ).toThrowError(
      expect.objectContaining<Partial<SessionAuthenticationError>>({
        reason: "EXPIRED",
      }),
    );
  });

  it.each([
    ["Staff", { staffStatus: "INACTIVE" as const }],
    ["branch", { branchStatus: "INACTIVE" as const }],
  ])("ปฏิเสธ session เมื่อ %s ไม่ active", (_kind, status) => {
    expect(() =>
      validateStoredSession({ ...validFixture, ...status }, NOW),
    ).toThrowError(SessionAuthenticationError);
  });

  it("touch เมื่อ activity ล่าสุดครบ 5 นาทีเท่านั้น", () => {
    expect(
      shouldTouchSession(new Date(NOW.getTime() - 4 * 60_000), NOW),
    ).toBe(false);
    expect(
      shouldTouchSession(new Date(NOW.getTime() - 5 * 60_000), NOW),
    ).toBe(true);
  });
});

describe("authoritative session loader", () => {
  let repository: FakeSessionRepository;

  beforeEach(() => {
    repository = new FakeSessionRepository();
  });

  it("คืน null เมื่อไม่มี cookie หรือลายเซ็นไม่ถูกต้อง", async () => {
    const noCookie = createSessionService({
      readSessionCookie: async () => undefined,
      verifyClaims: async () => validClaims,
      hashSessionId: () => TOKEN_HASH,
      repository,
      now: () => NOW,
    });

    await expect(noCookie.getOptionalSession()).resolves.toBeNull();
    await expect(
      createFixtureService(repository, null).getOptionalSession(),
    ).resolves.toBeNull();
  });

  it("ปฏิเสธ row เมื่อ token hash ที่อ่านคืนไม่ตรงกับ session ID", async () => {
    repository.row = { ...validFixture, sessionTokenHash: "b".repeat(64) };

    await expect(
      createFixtureService(repository).getOptionalSession(),
    ).resolves.toBeNull();
  });

  it.each([
    ["staff", { staffId: 2 }],
    ["role", { role: "MANAGER" as const }],
    ["branch", { homeBranchId: 2 }],
    ["mode", { mode: "PASSWORD_CHANGE_REQUIRED" as const }],
  ])("ปฏิเสธ %s claim ที่ไม่ตรงฐานข้อมูล", async (_field, staleClaim) => {
    await expect(
      createFixtureService(repository, {
        ...validClaims,
        ...staleClaim,
      }).getOptionalSession(),
    ).resolves.toBeNull();
  });

  it("mark EXPIRED พร้อม audit เมื่อระบุ actor จาก row ที่หมดอายุได้", async () => {
    repository.row = { ...validFixture, idleExpiresAt: NOW };

    await expect(
      createFixtureService(repository).getOptionalSession(),
    ).resolves.toBeNull();
    expect(repository.row?.revokedAt).toEqual(NOW);
    expect(repository.expiredAudits).toEqual([
      {
        authSessionId: 41,
        staffId: 1,
        branchId: 1,
        occurredAt: NOW,
      },
    ]);
  });

  it("ไม่เขียน activity ก่อนครบ 5 นาที", async () => {
    repository.row = {
      ...validFixture,
      lastSeenAt: new Date(NOW.getTime() - 4 * 60_000),
    };

    await createFixtureService(repository).getOptionalSession();

    expect(repository.touches).toHaveLength(0);
  });

  it("เลื่อน idle expiry 30 นาทีเมื่อครบ touch interval", async () => {
    repository.row = {
      ...validFixture,
      lastSeenAt: new Date(NOW.getTime() - 5 * 60_000),
    };

    await createFixtureService(repository).getOptionalSession();

    expect(repository.row?.lastSeenAt).toEqual(NOW);
    expect(repository.row?.idleExpiresAt).toEqual(
      new Date("2026-08-10T05:00:00.000Z"),
    );
  });

  it("ยอม password-change session เฉพาะ guard ที่อนุญาต", async () => {
    const passwordChangeClaims: SessionClaims = {
      ...validClaims,
      mode: "PASSWORD_CHANGE_REQUIRED",
    };
    repository.row = {
      ...validFixture,
      mode: "PASSWORD_CHANGE_REQUIRED",
    };
    const service = createFixtureService(repository, passwordChangeClaims);

    await expect(
      service.requireSession({ allowPasswordChange: true }),
    ).resolves.toMatchObject({ mode: "PASSWORD_CHANGE_REQUIRED" });
    await expect(service.requireFullSession()).rejects.toMatchObject({
      status: 403,
    });
  });

  it("require guard ตอบ 401 เมื่อไม่มี authoritative session", async () => {
    repository.row = null;

    await expect(
      createFixtureService(repository).requireSession({
        allowPasswordChange: true,
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
});
