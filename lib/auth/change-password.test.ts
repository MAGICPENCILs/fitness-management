import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AuthRepository,
  ChangePasswordSessionInput,
} from "@/lib/auth/auth-repository";
import { createAuthService } from "@/lib/auth/auth-service";
import { verifyPassword } from "@/lib/auth/password";
import type { AuthenticatedStaff } from "@/lib/auth/session-service";

const NOW = new Date("2026-08-11T05:00:00.000Z");
const REQUEST = {
  ipFingerprint: "f".repeat(64),
  userAgentCategory: "DESKTOP" as const,
};
const PASSWORD_CHANGE_SESSION: AuthenticatedStaff = {
  authSessionId: 77,
  staffId: 4,
  staffCode: "COUNTER004",
  firstName: "สมชาย",
  lastName: "ใจดี",
  role: "COUNTER",
  homeBranchId: 3,
  branchName: "สาขาสาม",
  mode: "PASSWORD_CHANGE_REQUIRED",
};

/** สร้าง repository boundary ที่บันทึก input transaction โดยไม่เชื่อม MySQL จริง */
function createRepository() {
  const changed: ChangePasswordSessionInput[] = [];
  const repository = {
    changePasswordAndRotateSession: async (input: ChangePasswordSessionInput) => {
      changed.push(input);
    },
  } as unknown as AuthRepository;
  return { repository, changed };
}

describe("change own password", () => {
  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET =
      "test-session-secret-that-is-at-least-32-bytes";
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.AUTH_SESSION_SECRET;
  });

  it("hashes the password and rotates the forced session to FULL atomically", async () => {
    const { repository, changed } = createRepository();
    const service = createAuthService(repository, { now: () => NOW });

    const result = await service.changeOwnPassword(
      PASSWORD_CHANGE_SESSION,
      "ChangedPass#2026",
      REQUEST,
    );

    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({
      currentAuthSessionId: 77,
      staffId: 4,
      branchId: 3,
      passwordChangedAt: NOW,
      newSession: {
        mode: "FULL",
        createdAt: NOW,
        absoluteExpiresAt: new Date(NOW.getTime() + 8 * 60 * 60_000),
        idleExpiresAt: new Date(NOW.getTime() + 30 * 60_000),
        ipFingerprint: REQUEST.ipFingerprint,
      },
    });
    expect(changed[0].newSession.sessionTokenHash).not.toContain(
      result.claims.sessionId,
    );
    await expect(
      verifyPassword(changed[0].passwordHash, "ChangedPass#2026"),
    ).resolves.toBe(true);
    expect(result.claims).toMatchObject({
      staffId: 4,
      role: "COUNTER",
      homeBranchId: 3,
      mode: "FULL",
    });
    expect(JSON.stringify(changed[0])).not.toContain("ChangedPass#2026");
  });

  it("ตัด milliseconds ของ session ใหม่ก่อนหมุน cookie เพื่อให้ claims ตรงกับ MySQL", async () => {
    const fractionalNow = new Date("2026-08-11T05:00:00.900Z");
    const { repository, changed } = createRepository();
    const service = createAuthService(repository, { now: () => fractionalNow });

    const result = await service.changeOwnPassword(
      PASSWORD_CHANGE_SESSION,
      "ChangedPass#2026",
      REQUEST,
    );

    expect(result.claims.expiresAt).toBe(1786453200);
    expect(changed[0].newSession).toMatchObject({
      createdAt: new Date("2026-08-11T05:00:00.000Z"),
      lastSeenAt: new Date("2026-08-11T05:00:00.000Z"),
      absoluteExpiresAt: new Date("2026-08-11T13:00:00.000Z"),
      idleExpiresAt: new Date("2026-08-11T05:30:00.000Z"),
    });
  });

  it("rejects a weak password before starting the transaction", async () => {
    const { repository, changed } = createRepository();
    const service = createAuthService(repository, { now: () => NOW });

    await expect(
      service.changeOwnPassword(PASSWORD_CHANGE_SESSION, "weak", REQUEST),
    ).rejects.toMatchObject({ code: "INVALID_PASSWORD", status: 400 });
    expect(changed).toHaveLength(0);
  });

  it("rejects a FULL session so the forced-password endpoint cannot rotate arbitrary sessions", async () => {
    const { repository, changed } = createRepository();
    const service = createAuthService(repository, { now: () => NOW });

    await expect(
      service.changeOwnPassword(
        { ...PASSWORD_CHANGE_SESSION, mode: "FULL" },
        "ChangedPass#2026",
        REQUEST,
      ),
    ).rejects.toMatchObject({ code: "PASSWORD_CHANGE_NOT_REQUIRED", status: 403 });
    expect(changed).toHaveLength(0);
  });
});
