import { unstable_doesMiddlewareMatch as unstable_doesProxyMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { signSessionClaims } from "@/lib/auth/session-token";
import type { SessionClaims } from "@/lib/auth/types";
import { config, proxy } from "@/proxy";

const NOW = new Date("2026-08-11T04:00:00.000Z");
const originalSecret = process.env.AUTH_SESSION_SECRET;

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
  });

  it.each([
    ["/_next/static/chunk.js", false],
    ["/_next/image?url=%2Flogo.png", false],
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

  it("returns a direct 403 page response for an optimistic role denial", async () => {
    const response = await proxy(
      await request("/settings/security", claims("COUNTER")),
    );

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe("บัญชีนี้ไม่มีสิทธิ์เข้าถึงหน้านี้");
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

  it("redirects FULL sessions away from the login and password-change pages", async () => {
    for (const path of ["/login", "/change-password"]) {
      const response = await proxy(await request(path, claims("OWNER")));
      expect(response.headers.get("location")).toBe(
        "https://fitness.example/",
      );
    }
  });
});
