import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthError } from "@/lib/auth/auth-errors";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  changeOwnPassword: vi.fn(),
  requireSession: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
}));

vi.mock("@/lib/auth/auth-service", () => ({
  login: mocks.login,
  logout: mocks.logout,
  changeOwnPassword: mocks.changeOwnPassword,
}));
vi.mock("@/lib/auth/session-service", () => ({
  requireSession: mocks.requireSession,
  SessionAuthenticationError: class SessionAuthenticationError extends Error {},
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mocks.cookieGet,
    set: mocks.cookieSet,
    delete: mocks.cookieDelete,
  }),
}));

import { POST as changePasswordPost } from "@/app/api/auth/change-password/route";
import { POST as loginPost, loginErrorResponse } from "@/app/api/auth/login/route";
import { POST as logoutPost } from "@/app/api/auth/logout/route";
import { getSessionCookieOptions } from "@/lib/auth/session-cookie";

const APP_ORIGIN = "https://fitness.example";
const SESSION = {
  authSessionId: 1,
  staffId: 1,
  staffCode: "OWNER001",
  firstName: "Owner",
  lastName: "One",
  role: "OWNER" as const,
  homeBranchId: 1,
  branchName: "Main",
  mode: "PASSWORD_CHANGE_REQUIRED" as const,
};

/** สร้าง POST request แบบ same-origin สำหรับทดสอบ boundary ของ Route Handler โดยตรง */
function post(path: string, body?: unknown, origin = APP_ORIGIN): Request {
  return new Request(`${APP_ORIGIN}${path}`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("authentication route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_ORIGIN = APP_ORIGIN;
    process.env.TRUST_PROXY = "false";
    mocks.cookieGet.mockReturnValue({ value: "signed-session" });
    mocks.requireSession.mockResolvedValue(SESSION);
    mocks.login.mockResolvedValue({
      sessionCookie: "new-signed-session",
      returnTo: "/members",
      claims: {},
    });
    mocks.changeOwnPassword.mockResolvedValue({
      sessionCookie: "rotated-signed-session",
      claims: {},
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.APP_ORIGIN;
    delete process.env.TRUST_PROXY;
  });

  it("sets the exact secure production cookie after login", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await loginPost(
      post("/api/auth/login", {
        staffCode: "OWNER001",
        password: "ValidPass#2026",
        returnTo: "/members",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.cookieSet).toHaveBeenCalledWith({
      name: AUTH_COOKIE_NAME,
      value: "new-signed-session",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 28_800,
    });
  });

  it("keeps the session cookie non-secure only in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getSessionCookieOptions()).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 28_800,
    });
  });

  it("normalizes an unsafe returnTo before calling the login service", async () => {
    await loginPost(
      post("/api/auth/login", {
        staffCode: "OWNER001",
        password: "ValidPass#2026",
        returnTo: "https://attacker.example/steal",
      }),
    );

    expect(mocks.login).toHaveBeenCalledWith(
      expect.objectContaining({ returnTo: "/" }),
      expect.any(Object),
    );
  });

  it("returns generic validation and origin errors without calling login", async () => {
    const invalid = await loginPost(post("/api/auth/login", { staffCode: "" }));
    const untrusted = await loginPost(
      post(
        "/api/auth/login",
        { staffCode: "OWNER001", password: "ValidPass#2026" },
        "https://attacker.example",
      ),
    );

    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({
      error: "ข้อมูลเข้าสู่ระบบไม่ถูกต้อง",
    });
    expect(untrusted.status).toBe(403);
    await expect(untrusted.json()).resolves.toEqual({
      error: "ไม่สามารถดำเนินการได้",
    });
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it("maps malformed and empty Login JSON to the generic validation response", async () => {
    for (const body of ["", "{"]) {
      const response = await loginPost(
        new Request(`${APP_ORIGIN}/api/auth/login`, {
          method: "POST",
          headers: { origin: APP_ORIGIN, "content-type": "application/json" },
          body,
        }),
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "ข้อมูลเข้าสู่ระบบไม่ถูกต้อง",
      });
    }
  });

  it("uses a generic 429 response and fixed Retry-After", async () => {
    const response = loginErrorResponse(
      new AuthError("RATE_LIMITED", 429, "account-specific detail", 321),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("900");
    await expect(response.json()).resolves.toEqual({
      error: "ไม่สามารถเข้าสู่ระบบได้ชั่วคราว กรุณาลองใหม่ภายหลัง",
    });
  });

  it("revokes the server session before deleting the cookie", async () => {
    const order: string[] = [];
    mocks.logout.mockImplementation(async () => {
      order.push("revoke");
    });
    mocks.cookieDelete.mockImplementation(() => {
      order.push("delete");
    });

    const response = await logoutPost(post("/api/auth/logout"));

    expect(response.status).toBe(200);
    expect(mocks.logout).toHaveBeenCalledWith(
      "signed-session",
      expect.any(Object),
    );
    expect(mocks.cookieDelete).toHaveBeenCalledWith(AUTH_COOKIE_NAME);
    expect(order).toEqual(["revoke", "delete"]);
  });

  it("changes the password only with the forced session and rotates the cookie", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await changePasswordPost(
      post("/api/auth/change-password", {
        password: "ChangedPass#2026",
        confirmation: "ChangedPass#2026",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.requireSession).toHaveBeenCalledWith({
      allowPasswordChange: true,
    });
    expect(mocks.changeOwnPassword).toHaveBeenCalledWith(
      SESSION,
      "ChangedPass#2026",
      expect.any(Object),
    );
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      expect.objectContaining({
        name: AUTH_COOKIE_NAME,
        value: "rotated-signed-session",
        secure: true,
      }),
    );
  });

  it("rejects mismatched password confirmation before changing state", async () => {
    const response = await changePasswordPost(
      post("/api/auth/change-password", {
        password: "ChangedPass#2026",
        confirmation: "DifferentPass#2026",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.changeOwnPassword).not.toHaveBeenCalled();
  });

  it("maps malformed and empty Change Password JSON to generic validation", async () => {
    for (const body of ["", "{"]) {
      const response = await changePasswordPost(
        new Request(`${APP_ORIGIN}/api/auth/change-password`, {
          method: "POST",
          headers: { origin: APP_ORIGIN, "content-type": "application/json" },
          body,
        }),
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "ข้อมูลรหัสผ่านไม่ถูกต้อง",
      });
    }
  });
});
