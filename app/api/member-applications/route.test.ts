import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createMemberApplication: vi.fn() }));

vi.mock("@/lib/member-portal-service", () => ({
  createMemberApplication: mocks.createMemberApplication,
  getMemberApplications: vi.fn(),
  MemberPortalError: class MemberPortalError extends Error {
    constructor(public code: string) { super(code); }
  },
}));

import { POST } from "./route";

const APP_ORIGIN = "https://fitness.example";

describe("POST /api/member-applications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_ORIGIN = APP_ORIGIN;
  });

  it("ไม่ส่งต่อ policyVersion ที่ public client ปลอมมาให้ service", async () => {
    const response = await POST(new Request(`${APP_ORIGIN}/api/member-applications`, {
      method: "POST",
      headers: { origin: APP_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({
        branchId: 1,
        firstName: "สมชาย",
        lastName: "ใจดี",
        phone: "0812345678",
        email: "member@example.com",
        password: "ValidPass#2026",
        servicePrivacyConsent: true,
        marketingConsent: false,
        policyVersion: "attacker-version",
      }),
    }));

    expect(response.status).toBe(202);
    expect(mocks.createMemberApplication).toHaveBeenCalledWith({
      branchId: 1,
      firstName: "สมชาย",
      lastName: "ใจดี",
      phone: "0812345678",
      email: "member@example.com",
      password: "ValidPass#2026",
      servicePrivacyConsent: true,
      marketingConsent: false,
    });
  });
});
