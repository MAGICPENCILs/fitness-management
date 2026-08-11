import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { branches, staff } from "@/db/schema";
import {
  canManageStaff,
  getPermissionSnapshot,
  hasPermission,
  type ActorContext,
  type Permission,
  type StaffRole,
} from "@/lib/rbac";
import {
  requireFullSession,
  SessionAuthenticationError,
} from "@/lib/auth/session-service";
import { runAuditedMutation, writeAudit } from "@/lib/audit-service";

const STAFF_COOKIE = "fitness_staff_id";

/** เปิดข้อมูล Staff Switcher เฉพาะ development ที่ opt in ชัดเจน เพื่อไม่เผยรายชื่อพนักงานใน runtime ปกติ */
function isDevStaffSwitcherEnabled() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.ENABLE_DEV_STAFF_SWITCHER === "true"
  );
}

export class AuthorizationError extends Error {
  /** สร้างข้อผิดพลาดการยืนยันสิทธิ์พร้อมสถานะ HTTP สำหรับ Route Handler */
  constructor(
    message: string,
    public status: 401 | 403,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class StaffOperationError extends Error {
  /** สร้างข้อผิดพลาดทางธุรกิจของบัญชีพนักงานพร้อมสถานะ HTTP */
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "StaffOperationError";
  }
}

export type StaffInput = {
  staffCode: string;
  firstName: string;
  lastName: string;
  homeBranchId: number;
  role: StaffRole;
  phone?: string;
  email?: string;
  status?: "ACTIVE" | "INACTIVE";
};

/** โหลดบัญชีที่เปิดใช้งานและข้อมูลสาขาเฉพาะส่วนที่จำเป็นต่อ staff context */
async function getActiveStaffRows() {
  return db
    .select({
      id: staff.id,
      staffCode: staff.staffCode,
      firstName: staff.firstName,
      lastName: staff.lastName,
      role: staff.role,
      homeBranchId: staff.homeBranchId,
      status: staff.status,
      branchName: branches.name,
    })
    .from(staff)
    .innerJoin(branches, eq(staff.homeBranchId, branches.id))
    .where(and(eq(staff.status, "ACTIVE"), eq(branches.status, "ACTIVE")))
    .orderBy(asc(staff.firstName), asc(staff.lastName));
}

/** สร้างบริบทจาก authoritative session, แปลง auth failure เป็น AuthorizationError และไม่เผยรายชื่อ Staff นอก development */
export async function getStaffContext() {
  let current: Awaited<ReturnType<typeof requireFullSession>>;
  try {
    current = await requireFullSession();
  } catch (error) {
    if (error instanceof SessionAuthenticationError) {
      throw new AuthorizationError(error.message, error.status);
    }
    throw error;
  }
  const actor: ActorContext = {
    staffId: current.staffId,
    role: current.role,
    homeBranchId: current.homeBranchId,
  };
  const devSwitcherEnabled = isDevStaffSwitcherEnabled();
  const [branchRows, availableStaff] = await Promise.all([
    actor.role === "OWNER"
      ? db
          .select({ id: branches.id })
          .from(branches)
          .where(eq(branches.status, "ACTIVE"))
      : Promise.resolve([{ id: actor.homeBranchId }]),
    devSwitcherEnabled
      ? getActiveStaffRows()
      : Promise.resolve([]),
  ]);

  return {
    staff: {
      id: current.staffId,
      staffCode: current.staffCode,
      displayName: `${current.firstName} ${current.lastName}`.trim(),
      role: current.role,
      homeBranchId: current.homeBranchId,
      branchName: current.branchName,
    },
    availableStaff: availableStaff.map((row) => ({
      id: row.id,
      staffCode: row.staffCode,
      displayName: `${row.firstName} ${row.lastName}`.trim(),
      role: row.role,
      branchName: row.branchName,
    })),
    devSwitcherEnabled,
    branchesAllowed:
      actor.role === "OWNER"
        ? branchRows.map((branch) => branch.id)
        : [actor.homeBranchId],
    permissions: getPermissionSnapshot(actor),
  };
}

/** บังคับตรวจสิทธิ์บนเซิร์ฟเวอร์และคืน actor เมื่อผ่านการตรวจสอบ */
export async function requirePermission(
  permission: Permission,
  resourceBranchId?: number,
  denial?: { action: string; entityType: string; entityId?: number },
) {
  const context = await getStaffContext();
  const actor: ActorContext = {
    staffId: context.staff.id,
    role: context.staff.role,
    homeBranchId: context.staff.homeBranchId,
  };
  if (!hasPermission(actor, permission, resourceBranchId)) {
    await writeAudit(db, {
      actorStaffId: actor.staffId,
      branchId: actor.homeBranchId,
      action: denial?.action ?? "PERMISSION_DENIED",
      entityType: denial?.entityType ?? "PERMISSION",
      entityId: denial?.entityId,
      result: "DENIED",
      metadata: {
        module: permission.replace(/[^A-Za-z0-9_.-]+/g, "_").toUpperCase(),
        ...(resourceBranchId === undefined ? {} : { branchId: resourceBranchId }),
      },
    });
    throw new AuthorizationError("บัญชีนี้ไม่มีสิทธิ์ดำเนินการ", 403);
  }
  return actor;
}

/** ใช้เฉพาะ dev switcher และแปลง auth failure เป็น StaffOperationError เพื่อให้ selector route ตอบ 401 */
export async function setCurrentStaffCookie(staffId: number) {
  if (!isDevStaffSwitcherEnabled()) {
    throw new StaffOperationError("ไม่พบการทำงานนี้", 404);
  }
  let previousContext: Awaited<ReturnType<typeof getStaffContext>>;
  try {
    previousContext = await getStaffContext();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      throw new StaffOperationError(error.message, error.status);
    }
    throw error;
  }
  const [selected] = await db
    .select({ id: staff.id, homeBranchId: staff.homeBranchId })
    .from(staff)
    .where(and(eq(staff.id, staffId), eq(staff.status, "ACTIVE")))
    .limit(1);
  if (!selected)
    throw new StaffOperationError("ไม่พบบัญชีพนักงานที่เปิดใช้งาน", 404);

  (await cookies()).set(STAFF_COOKIE, String(staffId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  await writeAudit(db, {
    actorStaffId: previousContext.staff.id,
    branchId: previousContext.staff.homeBranchId,
    action: "STAFF_CONTEXT_CHANGED",
    entityType: "STAFF",
    entityId: staffId,
    result: "SUCCESS",
    metadata: { branchId: selected.homeBranchId },
  });
}

/** คืนรายการพนักงานตามขอบเขตสาขาที่ actor มีสิทธิ์จัดการ */
export async function getStaffDashboard() {
  const actor = await requirePermission("staff.manage");
  const rows = await db
    .select({
      id: staff.id,
      staffCode: staff.staffCode,
      firstName: staff.firstName,
      lastName: staff.lastName,
      homeBranchId: staff.homeBranchId,
      branchName: branches.name,
      role: staff.role,
      phone: staff.phone,
      email: staff.email,
      status: staff.status,
      createdAt: staff.createdAt,
      updatedAt: staff.updatedAt,
    })
    .from(staff)
    .innerJoin(branches, eq(staff.homeBranchId, branches.id))
    .where(actor.role === "OWNER" ? undefined : eq(staff.homeBranchId, actor.homeBranchId))
    .orderBy(asc(staff.firstName), asc(staff.lastName));
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt?.toISOString() ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  }));
}

/** สร้างบัญชีพนักงานเมื่อ actor จัดการบทบาทและสาขาเป้าหมายได้ */
export async function createStaff(input: StaffInput) {
  const actor = await requirePermission("staff.manage", input.homeBranchId);
  if (!canManageStaff(actor, input))
    throw new AuthorizationError("ไม่มีสิทธิ์สร้างบทบาทหรือสาขานี้", 403);
  try {
    return await runAuditedMutation<number>(
      {
        actorStaffId: actor.staffId,
        branchId: input.homeBranchId,
        action: "STAFF_CREATED",
        entityType: "STAFF",
        success: (id) => ({ entityId: id }),
      },
      async (tx) => {
        const result = await tx.insert(staff).values({
          ...input,
          staffCode: input.staffCode.toUpperCase(),
          phone: input.phone || null,
          email: input.email || null,
        });
        return result[0].insertId;
      },
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("Duplicate"))
      throw new StaffOperationError("รหัสพนักงานนี้ถูกใช้งานแล้ว", 409);
    throw error;
  }
}

/** แก้บัญชีพนักงานโดยตรวจทั้งข้อมูลเดิมและข้อมูลปลายทางเพื่อกันการยกระดับสิทธิ์ */
export async function updateStaff(staffId: number, input: StaffInput) {
  const [existing] = await db
    .select({ role: staff.role, homeBranchId: staff.homeBranchId })
    .from(staff)
    .where(eq(staff.id, staffId))
    .limit(1);
  if (!existing) throw new StaffOperationError("ไม่พบบัญชีพนักงาน", 404);

  const actor = await requirePermission("staff.manage", input.homeBranchId);
  if (!canManageStaff(actor, existing) || !canManageStaff(actor, input))
    throw new AuthorizationError("ไม่มีสิทธิ์แก้ไขบัญชี บทบาท หรือสาขานี้", 403);
  try {
    await runAuditedMutation(
      {
        actorStaffId: actor.staffId,
        branchId: input.homeBranchId,
        action: "STAFF_UPDATED",
        entityType: "STAFF",
        entityId: staffId,
        metadata: {
          fields: [
            "staffCode",
            "firstName",
            "lastName",
            "homeBranchId",
            "role",
            "phone",
            "email",
            "status",
          ],
        },
      },
      async (tx) => {
        await tx
          .update(staff)
          .set({
            ...input,
            staffCode: input.staffCode.toUpperCase(),
            phone: input.phone || null,
            email: input.email || null,
          })
          .where(eq(staff.id, staffId));
      },
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("Duplicate"))
      throw new StaffOperationError("รหัสพนักงานนี้ถูกใช้งานแล้ว", 409);
    throw error;
  }
}
