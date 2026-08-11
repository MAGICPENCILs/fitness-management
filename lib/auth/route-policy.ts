import type { SessionClaims } from "@/lib/auth/types";
import { hasPermission, type Permission } from "@/lib/rbac";

export type RouteDecision =
  | { type: "ALLOW" }
  | { type: "LOGIN" }
  | { type: "CHANGE_PASSWORD" }
  | { type: "FORBIDDEN" };

const PUBLIC_AUTH_PATHS = ["/login", "/change-password", "/api/auth"];

const PAGE_POLICIES = [
  ["/settings/security", "auth.security.read"],
  ["/settings/promotions", "payments.manage"],
  ["/settings/notifications", "settings.manage"],
  ["/settings/branches", "settings.manage"],
  ["/settings/staff", "staff.manage"],
  ["/settings/privacy", "privacy.request.create"],
  ["/settings/audit", "audit.read"],
  ["/settings", "settings.manage"],
  ["/personal-training", "pt.manage"],
  ["/accounting", "accounting.manage"],
  ["/equipment", "settings.manage"],
  ["/payments", "payments.manage"],
  ["/lockers", "access.manage"],
  ["/reports", "audit.read"],
  ["/members", "members.manage"],
  ["/access", "access.manage"],
  ["/classes", "classes.manage"],
  ["/crm", "members.manage"],
] as const satisfies readonly (readonly [string, Permission])[];

/** ตรวจ path แบบ segment boundary เพื่อไม่ให้ prefix เช่น /login-extra ถูกนับเป็นหน้า public โดยไม่ตั้งใจ */
function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** ใช้นโยบายที่เจาะจงที่สุดก่อน เพื่อไม่ให้ permission ของ /settings กลบหน้าลูกที่มีกฎต่างกัน */
function permissionForPage(pathname: string): Permission | null {
  return (
    PAGE_POLICIES.find(([prefix]) => matchesPrefix(pathname, prefix))?.[1] ??
    null
  );
}

/** ตัดสินสิทธิ์เชิง optimistic จาก signed claims เท่านั้น; service/route handler ยังต้องตรวจฐานข้อมูลและ RBAC ซ้ำ */
export function decideRouteAccess(
  pathname: string,
  claims: SessionClaims | null,
  now = new Date(),
): RouteDecision {
  if (PUBLIC_AUTH_PATHS.some((prefix) => matchesPrefix(pathname, prefix))) {
    return { type: "ALLOW" };
  }

  if (!claims || claims.expiresAt <= Math.floor(now.getTime() / 1_000)) {
    return { type: "LOGIN" };
  }

  if (claims.mode === "PASSWORD_CHANGE_REQUIRED") {
    return { type: "CHANGE_PASSWORD" };
  }

  if (pathname.startsWith("/api/")) return { type: "ALLOW" };

  const permission = permissionForPage(pathname);
  if (
    permission &&
    !hasPermission(
      {
        staffId: claims.staffId,
        role: claims.role,
        homeBranchId: claims.homeBranchId,
      },
      permission,
    )
  ) {
    return { type: "FORBIDDEN" };
  }

  return { type: "ALLOW" };
}
