import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loginMember: vi.fn(), cookieSet: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.cookieSet }) }));
vi.mock("@/lib/member-portal-service", () => ({
  MEMBER_LOGIN_LOCK_SECONDS: 900,
  MemberPortalError: class MemberPortalError extends Error { constructor(public code: string) { super(code); } },
  loginMember: mocks.loginMember,
}));

import { POST } from "./route";
import { MemberPortalError } from "@/lib/member-portal-service";

const origin = "http://localhost:3005";
function request() {
  return new Request(`${origin}/api/member-auth/login`, { method: "POST", headers: { origin, "content-type": "application/json", "user-agent": "Browser" }, body: JSON.stringify({ email: "member@example.com", password: "WrongPassword" }) });
}

describe("POST /api/member-auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks(); process.env.APP_ORIGIN = origin; process.env.TRUST_PROXY = "false";
  });

  it("ส่ง fingerprint context ให้ service และตั้ง cookie เมื่อสำเร็จ", async () => {
    mocks.loginMember.mockResolvedValue({ token: "opaque", expiresAt: new Date() });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.loginMember).toHaveBeenCalledWith("member@example.com", "WrongPassword", { ipFingerprint: null, userAgentCategory: "DESKTOP" });
    expect(mocks.cookieSet).toHaveBeenCalled();
  });

  it("คืน 429 และ Retry-After เมื่อ Member login ถูก rate limit", async () => {
    mocks.loginMember.mockRejectedValue(new MemberPortalError("RATE_LIMITED"));
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});
