import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { branches } from "@/db/schema";
import { runAuditedMutation, writeAudit } from "@/lib/audit-service";
import { getStaffContext, requirePermission } from "@/lib/staff-service";

const BRANCH_COOKIE = "fitness_branch_id";

export class BranchOperationError extends Error {
  /** สร้างข้อผิดพลาดทางธุรกิจของสาขาพร้อมสถานะ HTTP สำหรับ route handler */
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "BranchOperationError";
  }
}

/** โหลดเฉพาะสาขาที่ authoritative Staff มีสิทธิ์ แล้วเลือก cookie ภายในขอบเขตนั้นเท่านั้น */
export async function getBranchContext() {
  const staffContext = await getStaffContext();
  const branchRows = await db
    .select({
      id: branches.id,
      code: branches.code,
      name: branches.name,
      isMain: branches.isMain,
    })
    .from(branches)
    .where(
      and(
        eq(branches.status, "ACTIVE"),
        inArray(branches.id, staffContext.branchesAllowed),
      ),
    )
    .orderBy(asc(branches.name));
  if (branchRows.length === 0)
    throw new BranchOperationError("ระบบยังไม่มีสาขาที่เปิดใช้งาน", 503);

  const cookieValue = (await cookies()).get(BRANCH_COOKIE)?.value;
  const requestedId = Number(cookieValue);
  const current =
    branchRows.find((branch) => branch.id === requestedId) ??
    branchRows.find((branch) => branch.isMain) ??
    branchRows[0];

  return { branches: branchRows, current };
}

/** คืนรหัสสาขาปัจจุบันสำหรับ query และ mutation ฝั่งเซิร์ฟเวอร์ */
export async function getCurrentBranchId() {
  return (await getBranchContext()).current.id;
}

/** ตรวจว่าสาขาที่ต้องการสลับยังเปิดใช้งานอยู่ก่อนเขียน cookie */
export async function assertActiveBranch(branchId: number) {
  const [branch] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(and(eq(branches.id, branchId), eq(branches.status, "ACTIVE")))
    .limit(1);
  if (!branch) throw new BranchOperationError("ไม่พบสาขาที่เลือก", 404);
}

/** เขียน branch context แบบ HTTP-only หลังยืนยันว่า authoritative Staff มีสิทธิ์ในสาขาเป้าหมาย */
export async function setCurrentBranchCookie(branchId: number) {
  const staffContext = await getStaffContext();
  if (!staffContext.branchesAllowed.includes(branchId)) {
    throw new BranchOperationError("ไม่มีสิทธิ์เลือกสาขานี้", 403);
  }
  await assertActiveBranch(branchId);
  (await cookies()).set(BRANCH_COOKIE, String(branchId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  await writeAudit(db, {
    actorStaffId: staffContext.staff.id,
    branchId: staffContext.staff.homeBranchId,
    action: "BRANCH_CONTEXT_CHANGED",
    entityType: "BRANCH",
    entityId: branchId,
    result: "SUCCESS",
    metadata: { branchId },
  });
}

/** โหลดทุกสาขาสำหรับหน้าตั้งค่า โดยรวมสาขาที่ปิดใช้งานไว้ให้ผู้ดูแลตรวจสอบได้ */
export async function getBranchesDashboard() {
  const rows = await db.select().from(branches).orderBy(asc(branches.name));
  return rows.map((branch) => ({
    ...branch,
    createdAt: branch.createdAt?.toISOString() ?? null,
    updatedAt: branch.updatedAt?.toISOString() ?? null,
  }));
}

/** สร้างสาขาใหม่ด้วยรหัสไม่ซ้ำและไม่เปลี่ยนสาขาหลักเดิมโดยอัตโนมัติ */
export async function createBranch(input: {
  code: string;
  name: string;
  phone?: string;
  address?: string;
}) {
  const actor = await requirePermission("settings.manage", undefined, {
    action: "BRANCH_CREATED",
    entityType: "BRANCH",
  });
  try {
    return await runAuditedMutation<number>(
      {
        actorStaffId: actor.staffId,
        branchId: actor.homeBranchId,
        action: "BRANCH_CREATED",
        entityType: "BRANCH",
        success: (id) => ({ entityId: id }),
      },
      async (tx) => {
        const result = await tx.insert(branches).values({
          ...input,
          code: input.code.toUpperCase(),
          phone: input.phone || null,
          address: input.address || null,
        });
        return result[0].insertId;
      },
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("Duplicate"))
      throw new BranchOperationError("รหัสสาขานี้ถูกใช้งานแล้ว", 409);
    throw error;
  }
}
