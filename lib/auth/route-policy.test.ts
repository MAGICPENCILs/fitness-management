import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decideRouteAccess } from "@/lib/auth/route-policy";
import type { SessionClaims } from "@/lib/auth/types";

const NOW = new Date("2026-08-11T04:00:00.000Z");

/** สร้าง signed-claims fixture โดยเปลี่ยนเฉพาะ field ที่แต่ละกรณีต้องการทดสอบ */
function claims(
  role: SessionClaims["role"],
  overrides: Partial<SessionClaims> = {},
): SessionClaims {
  return {
    sessionId: "session-id",
    staffId: 1,
    role,
    homeBranchId: 10,
    mode: "FULL",
    expiresAt: Math.floor(NOW.getTime() / 1_000) + 60,
    ...overrides,
  };
}

describe("auth route policy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires login when a protected page has no signed claims", () => {
    expect(decideRouteAccess("/members", null)).toEqual({ type: "LOGIN" });
  });

  it("requires password change before any protected page", () => {
    expect(
      decideRouteAccess(
        "/members",
        claims("COUNTER", { mode: "PASSWORD_CHANGE_REQUIRED" }),
      ),
    ).toEqual({ type: "CHANGE_PASSWORD" });
  });

  it("treats an expired custom expiresAt claim as unauthenticated", () => {
    expect(
      decideRouteAccess(
        "/members",
        claims("COUNTER", {
          expiresAt: Math.floor(NOW.getTime() / 1_000),
        }),
      ),
    ).toEqual({ type: "LOGIN" });
  });

  it("allows only roles with the permission mapped to the page", () => {
    expect(decideRouteAccess("/settings/security", claims("OWNER"))).toEqual({
      type: "ALLOW",
    });
    expect(decideRouteAccess("/settings/security", claims("COUNTER"))).toEqual({
      type: "FORBIDDEN",
    });
  });

  it.each([
    ["/settings/promotions", "COUNTER", "ALLOW"],
    ["/settings/privacy", "COUNTER", "ALLOW"],
    ["/settings/audit", "COUNTER", "FORBIDDEN"],
    ["/settings/staff", "MANAGER", "ALLOW"],
    ["/settings/security", "MANAGER", "ALLOW"],
    ["/settings", "COUNTER", "FORBIDDEN"],
  ] as const)(
    "uses the most specific policy for %s",
    (pathname, role, expectedType) => {
      expect(decideRouteAccess(pathname, claims(role))).toEqual({
        type: expectedType,
      });
    },
  );

  it("keeps public auth pages and endpoints outside protected-page policy", () => {
    expect(decideRouteAccess("/login", null)).toEqual({ type: "ALLOW" });
    expect(decideRouteAccess("/change-password", null)).toEqual({
      type: "ALLOW",
    });
    expect(decideRouteAccess("/api/auth/login", null)).toEqual({
      type: "ALLOW",
    });
    expect(decideRouteAccess("/forbidden", null)).toEqual({ type: "ALLOW" });
    expect(decideRouteAccess("/signup", null)).toEqual({ type: "ALLOW" });
    expect(decideRouteAccess("/member-login", null)).toEqual({ type: "ALLOW" });
    expect(decideRouteAccess("/member", null)).toEqual({ type: "ALLOW" });
    expect(decideRouteAccess("/api/member-auth/login", null)).toEqual({ type: "ALLOW" });
    expect(decideRouteAccess("/api/member-portal", null)).toEqual({ type: "ALLOW" });
  });

  it("allows auth pages for signed claims because authoritative page loaders decide redirects", () => {
    expect(decideRouteAccess("/login", claims("OWNER"))).toEqual({
      type: "ALLOW",
    });
    expect(
      decideRouteAccess(
        "/login",
        claims("COUNTER", { mode: "PASSWORD_CHANGE_REQUIRED" }),
      ),
    ).toEqual({ type: "ALLOW" });
  });
});
