import { describe, expect, it } from "vitest";

import {
  createDevStaffSwitchService,
  type DevStaffSwitchRepository,
} from "@/lib/auth/dev-staff-switch";

const NOW = new Date("2026-08-11T06:00:00.000Z");
const CURRENT = {
  authSessionId: 41,
  staffId: 1,
  homeBranchId: 1,
};

class FakeRepository implements DevStaffSwitchRepository {
  calls: Array<Record<string, unknown>> = [];
  fail = false;

  async rotate(input: Parameters<DevStaffSwitchRepository["rotate"]>[0]) {
    this.calls.push(input);
    if (this.fail) throw new Error("audit unavailable");
    const target = { id: 3, role: "COUNTER" as const, homeBranchId: 2 };
    return { target, signed: await input.sign(target) };
  }
}

describe("development Staff session rotation", () => {
  it("creates FULL target claims and stores only a hash through one repository rotation", async () => {
    const repository = new FakeRepository();
    const service = createDevStaffSwitchService(repository, {
      now: () => NOW,
      createSessionId: () => "new-opaque-session-id",
      hashSessionId: () => "stored-session-hash",
      signSessionClaims: async (claims) => `signed:${claims.staffId}`,
    });

    const result = await service.rotate(CURRENT, 3, {
      ipFingerprint: "a".repeat(64),
      userAgentCategory: "DESKTOP",
    });

    expect(result.sessionCookie).toBe("signed:3");
    expect(result.claims).toEqual({
      sessionId: "new-opaque-session-id",
      staffId: 3,
      role: "COUNTER",
      homeBranchId: 2,
      mode: "FULL",
      expiresAt: 1786456800,
    });
    expect(repository.calls[0]).toMatchObject({
      currentAuthSessionId: 41,
      currentStaffId: 1,
      currentBranchId: 1,
      targetStaffId: 3,
      occurredAt: NOW,
      newSession: {
        sessionTokenHash: "stored-session-hash",
        mode: "FULL",
        createdAt: NOW,
        lastSeenAt: NOW,
        absoluteExpiresAt: new Date("2026-08-11T14:00:00.000Z"),
        idleExpiresAt: new Date("2026-08-11T06:30:00.000Z"),
      },
    });
    expect(JSON.stringify(repository.calls)).not.toContain("new-opaque-session-id");
  });

  it("ตัด milliseconds ของ session เป้าหมายก่อนเซ็นและบันทึก", async () => {
    const repository = new FakeRepository();
    const service = createDevStaffSwitchService(repository, {
      now: () => new Date("2026-08-11T06:00:00.900Z"),
      createSessionId: () => "new-opaque-session-id",
      hashSessionId: () => "stored-session-hash",
      signSessionClaims: async (claims) => `signed:${claims.staffId}`,
    });

    const result = await service.rotate(CURRENT, 3, {
      ipFingerprint: null,
      userAgentCategory: "UNKNOWN",
    });

    expect(result.claims.expiresAt).toBe(1786456800);
    expect(repository.calls[0]).toMatchObject({
      occurredAt: new Date("2026-08-11T06:00:00.900Z"),
      newSession: {
        createdAt: new Date("2026-08-11T06:00:00.000Z"),
        lastSeenAt: new Date("2026-08-11T06:00:00.000Z"),
        absoluteExpiresAt: new Date("2026-08-11T14:00:00.000Z"),
        idleExpiresAt: new Date("2026-08-11T06:30:00.000Z"),
      },
    });
  });

  it("does not return a signed cookie when the atomic repository rotation rolls back", async () => {
    const repository = new FakeRepository();
    repository.fail = true;
    const signed: string[] = [];
    const service = createDevStaffSwitchService(repository, {
      now: () => NOW,
      createSessionId: () => "new-session",
      hashSessionId: () => "stored-hash",
      signSessionClaims: async (claims) => {
        signed.push(String(claims.staffId));
        return "signed-cookie";
      },
    });

    await expect(
      service.rotate(CURRENT, 3, {
        ipFingerprint: null,
        userAgentCategory: "UNKNOWN",
      }),
    ).rejects.toThrow("audit unavailable");
    expect(signed).toEqual([]);
  });

  it("signs before repository writes and propagates signing failure", async () => {
    const repository = new FakeRepository();
    const service = createDevStaffSwitchService(repository, {
      now: () => NOW,
      createSessionId: () => "new-session",
      hashSessionId: () => "stored-hash",
      signSessionClaims: async () => { throw new Error("SESSION_SECRET unavailable"); },
    });

    await expect(service.rotate(CURRENT, 3, {
      ipFingerprint: null,
      userAgentCategory: "UNKNOWN",
    })).rejects.toThrow("SESSION_SECRET unavailable");
    expect(repository.calls).toHaveLength(1);
  });
});
