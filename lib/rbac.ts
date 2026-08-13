export type StaffRole = "OWNER" | "MANAGER" | "COUNTER" | "TRAINER";

export type Permission =
  | "staff.manage"
  | "auth.security.read"
  | "auth.security.manage"
  | "privacy.consent.manage"
  | "privacy.request.create"
  | "privacy.request.approve"
  | "audit.read"
  | "members.manage"
  | "payments.manage"
  | "access.manage"
  | "classes.manage"
  | "pt.manage"
  | "accounting.manage"
  | "settings.manage";

export type ActorContext = {
  staffId: number;
  role: StaffRole;
  homeBranchId: number;
};

export const ALL_PERMISSIONS = [
  "staff.manage",
  "auth.security.read",
  "auth.security.manage",
  "privacy.consent.manage",
  "privacy.request.create",
  "privacy.request.approve",
  "audit.read",
  "members.manage",
  "payments.manage",
  "access.manage",
  "classes.manage",
  "pt.manage",
  "accounting.manage",
  "settings.manage",
] as const satisfies readonly Permission[];

const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  OWNER: ALL_PERMISSIONS,
  MANAGER: [
    "staff.manage",
    "auth.security.read",
    "auth.security.manage",
    "privacy.consent.manage",
    "privacy.request.create",
    "privacy.request.approve",
    "audit.read",
    "members.manage",
    "payments.manage",
    "access.manage",
    "classes.manage",
    "pt.manage",
    "accounting.manage",
    "settings.manage",
  ],
  COUNTER: [
    "privacy.consent.manage",
    "privacy.request.create",
    "members.manage",
    "payments.manage",
    "access.manage",
    "classes.manage",
    "pt.manage",
  ],
  TRAINER: ["classes.manage", "pt.manage"],
};

/** ตรวจสิทธิ์ตามบทบาทและจำกัดสาขาสำหรับพนักงานที่ไม่ใช่ Owner */
export function hasPermission(
  actor: ActorContext,
  permission: Permission,
  resourceBranchId = actor.homeBranchId,
) {
  return (
    ROLE_PERMISSIONS[actor.role].includes(permission) &&
    (actor.role === "OWNER" || actor.homeBranchId === resourceBranchId)
  );
}

/** สร้าง permission snapshot จาก matrix เดียวกับ server guard สำหรับกรอง UI */
export function getPermissionSnapshot(actor: ActorContext) {
  return Object.fromEntries(
    ALL_PERMISSIONS.map((permission) => [
      permission,
      hasPermission(actor, permission),
    ]),
  ) as Record<Permission, boolean>;
}

/** ตรวจขอบเขตการจัดการบัญชีพนักงานโดยกัน Manager แก้ Owner หรือข้ามสาขา */
export function canManageStaff(
  actor: ActorContext,
  target: { role: StaffRole; homeBranchId: number },
) {
  if (actor.role === "OWNER") return true;
  return (
    actor.role === "MANAGER" &&
    target.role !== "OWNER" &&
    actor.homeBranchId === target.homeBranchId
  );
}
