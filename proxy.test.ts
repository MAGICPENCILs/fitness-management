import { unstable_doesMiddlewareMatch as unstable_doesProxyMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { signSessionClaims } from "@/lib/auth/session-token";
import type { SessionClaims } from "@/lib/auth/types";
import { config, proxy } from "@/proxy";

const NOW = new Date("2026-08-11T04:00:00.000Z");
const originalSecret = process.env.AUTH_SESSION_SECRET;
const originalOrigin = process.env.APP_ORIGIN;

/** สร้าง claims สำหรับทดสอบ optimistic Proxy โดยไม่ใช้ state จากฐานข้อมูล */
function claims(
  role: SessionClaims["role"],
  overrides: Partial<SessionClaims> = {},
): SessionClaims {
  return {
    sessionId: "proxy-session-id",
    staffId: 1,
    role,
    homeBranchId: 10,
    mode: "FULL",
    expiresAt: Math.floor(NOW.getTime() / 1_000) + 60,
    ...overrides,
  };
}

/** สร้าง NextRequest พร้อม signed cookie เฉพาะกรณีที่ต้องทดสอบ claims */
async function request(
  path: string,
  sessionClaims?: SessionClaims,
): Promise<NextRequest> {
  const headers = new Headers();
  if (sessionClaims) {
    headers.set(
      "cookie",
      `${AUTH_COOKIE_NAME}=${await signSessionClaims(sessionClaims)}`,
    );
  }
  return new NextRequest(`https://fitness.example${path}`, { headers });
}

describe("proxy", () => {
  it.each([
    `/member-photos/${"a".repeat(64)}.png`,
    "/uploads/members/OLD.jpg",
    `http://localhost:3005/member-photos/${"a".repeat(64)}.png`,
    `/%6dember-photos/${"a".repeat(64)}.png`,
  ])("blocks optimizer reads/cache priming for member photo %s before session state", async (photoUrl) => {
    const req = await request(`/_next/image?url=${encodeURIComponent(photoUrl)}&w=64&q=75`);
    const cookieRead = vi.spyOn(req.cookies, "get");
    expect(unstable_doesProxyMatch({ config, nextConfig: {}, url: req.url })).toBe(true);
    const response = await proxy(req);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "ไม่พบรูปสมาชิก" });
    expect(cookieRead).not.toHaveBeenCalled();
  });

  it("passes normal local-image optimization through unchanged without reading cookies", async () => {
    const req = await request("/_next/image?url=%2Flogo.png&w=64&q=75");
    const cookieRead = vi.spyOn(req.cookies, "get");
    expect(unstable_doesProxyMatch({ config, nextConfig: {}, url: req.url })).toBe(true);
    const response = await proxy(req);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(cookieRead).not.toHaveBeenCalled();
  });
  it.each(["missing", "invalid", "full", "forced"])("rejects cross-Origin upload before reading %s session cookie", async (state) => {
    process.env.APP_ORIGIN = "https://fitness.example";
    const session = state === "full" ? claims("COUNTER") : state === "forced" ? claims("COUNTER", { mode: "PASSWORD_CHANGE_REQUIRED" }) : undefined;
    const base = await request("/api/upload", session);
    const headers = new Headers(base.headers);
    headers.set("origin", "https://evil.example");
    if (state === "invalid") headers.set("cookie", `${AUTH_COOKIE_NAME}=invalid`);
    const req = new NextRequest(base.url, { method: "POST", headers });
    const cookieRead = vi.spyOn(req.cookies, "get");
    const response = await proxy(req);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "คำขอไม่ผ่านการตรวจสอบความปลอดภัย" });
    expect(cookieRead).not.toHaveBeenCalled();
  });

  it("blocks the old filename gateway without reading session state", async () => {
    const req = await request(`/member-photos/${"a".repeat(64)}.png`);
    const cookieRead = vi.spyOn(req.cookies, "get");
    const response = await proxy(req);
    expect(response.status).toBe(404);
    expect(cookieRead).not.toHaveBeenCalled();
    expect(unstable_doesProxyMatch({ config, nextConfig: {}, url: req.url })).toBe(true);
  });

  it.each(["/uploads/members", "/uploads/members/old.jpg", "/uploads/members/nested/no-extension", "/uploads/privacy-cleanup", "/uploads/privacy-cleanup/token", "/uploads/privacy-cleanup/file.png"])("denies raw %s for every cookie state and GET/HEAD before reading cookies", async (rawPath) => {
    for (const method of ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      for (const session of [undefined, claims("OWNER"), claims("COUNTER")]) {
        const base = await request(rawPath, session);
        const req = new NextRequest(base.url, { headers: base.headers, method });
        const cookieRead = vi.spyOn(req.cookies, "get");
        expect(unstable_doesProxyMatch({ config, nextConfig: {}, url: req.url })).toBe(true);
        const response = await proxy(req);
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "ไม่พบรูปสมาชิก" });
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response.headers.get("location")).toBeNull();
        expect(cookieRead).not.toHaveBeenCalled();
      }
    }
  });

  it.each([
    ["/uploads/%6dembers/old.jpg", "/uploads/members/old.jpg"],
    ["/%75ploads/members/old.jpg", "/uploads/members/old.jpg"],
    ["/uploads%2fmembers%2fold.jpg", "/uploads/members/old.jpg"],
    ["/uploads/%70rivacy-cleanup/token", "/uploads/privacy-cleanup/token"],
    ["/%6dember-photos/old.png", "/member-photos/old.png"],
  ])("denies encoded private path %s before cookies", async (encoded, canonical) => {
    // Next router ตรวจ matcher ซ้ำกับ decoded pathname ก่อนเรียก Proxy
    expect(unstable_doesProxyMatch({ config, nextConfig: {}, url: canonical })).toBe(true);
    for (const session of [undefined, claims("OWNER")]) {
      const req = await request(encoded, session);
      const cookieRead = vi.spyOn(req.cookies, "get");
      const response = await proxy(req);
      expect(response.status).toBe(404);
      expect(cookieRead).not.toHaveBeenCalled();
    }
  });

  it.each(["/uploads/privacy-cleanup/token", "/uploads/privacy-cleanup/file.png", "/member-photos/by-member/7"])("blocks optimizer target %s for anonymous and staff HEAD/GET", async (target) => {
    for (const method of ["GET", "HEAD"]) {
      for (const session of [undefined, claims("OWNER")]) {
        const base = await request(`/_next/image?url=${encodeURIComponent(target)}&w=64&q=75`, session);
        const req = new NextRequest(base.url, { headers: base.headers, method });
        const cookieRead = vi.spyOn(req.cookies, "get");
        expect((await proxy(req)).status).toBe(404);
        expect(cookieRead).not.toHaveBeenCalled();
      }
    }
  });

  it("leaves protected photo session failures to the authoritative handler without redirect", async () => {
    const req = await request("/member-photos/by-member/7");
    const cookieRead = vi.spyOn(req.cookies, "get");
    const response = await proxy(req);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
    expect(cookieRead).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET =
      "test-session-secret-that-is-at-least-32-bytes";
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalSecret === undefined) delete process.env.AUTH_SESSION_SECRET;
    else process.env.AUTH_SESSION_SECRET = originalSecret;
    if (originalOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = originalOrigin;
  });

  it.each([
    ["/_next/static/chunk.js", false],
    ["/_next/image?url=%2Flogo.png", true],
    ["/favicon.ico", false],
    ["/logo.svg", false],
    ["/members", true],
    ["/api/members", true],
  ] as const)("matches %s only when auth policy should run", (url, expected) => {
    expect(
      unstable_doesProxyMatch({ config, nextConfig: {}, url }),
    ).toBe(expected);
  });

  it("redirects an unauthenticated page to login with a safe path and query", async () => {
    const response = await proxy(await request("/members?tab=active"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://fitness.example/login?returnTo=%2Fmembers%3Ftab%3Dactive",
    );
  });

  it("returns JSON 401 only for unauthenticated protected APIs", async () => {
    const response = await proxy(await request("/api/members"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "กรุณาเข้าสู่ระบบ",
    });
  });

  it("allows public auth pages and endpoints without a session", async () => {
    for (const path of ["/login", "/change-password", "/api/auth/login"]) {
      const response = await proxy(await request(path));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("redirects an optimistic page denial to the safe public forbidden page", async () => {
    const response = await proxy(
      await request("/settings/security", claims("COUNTER")),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://fitness.example/forbidden",
    );
  });

  it("leaves API role denials to the authoritative handler", async () => {
    const response = await proxy(
      await request("/api/staff", claims("COUNTER")),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects a password-change session away from protected pages", async () => {
    const response = await proxy(
      await request(
        "/members",
        claims("COUNTER", { mode: "PASSWORD_CHANGE_REQUIRED" }),
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://fitness.example/change-password",
    );
  });

  it("returns JSON 403 for a protected API during forced password change", async () => {
    const response = await proxy(
      await request(
        "/api/members",
        claims("COUNTER", { mode: "PASSWORD_CHANGE_REQUIRED" }),
      ),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("location")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: "กรุณาเปลี่ยนรหัสผ่านก่อนใช้งานระบบ",
    });
  });

  it("does not trust a correctly signed claim after its custom expiry", async () => {
    const response = await proxy(
      await request(
        "/members",
        claims("COUNTER", {
          expiresAt: Math.floor(NOW.getTime() / 1_000),
        }),
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://fitness.example/login?returnTo=%2Fmembers",
    );
  });

  it("allows auth pages for FULL and forced claims to avoid stale-cookie redirect loops", async () => {
    for (const sessionClaims of [
      claims("OWNER"),
      claims("COUNTER", { mode: "PASSWORD_CHANGE_REQUIRED" }),
    ]) {
      for (const path of ["/login", "/change-password"]) {
        const response = await proxy(await request(path, sessionClaims));
        expect(response.headers.get("x-middleware-next")).toBe("1");
        expect(response.headers.get("location")).toBeNull();
      }
    }
  });
});
