import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { branches } from "@/db/schema";

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

/** โหลดสาขาที่เปิดใช้งานและเลือกสาขาจาก cookie โดย fallback ไปสาขาหลักเสมอ */
export async function getBranchContext() {
  const branchRows = await db
    .select({
      id: branches.id,
      code: branches.code,
      name: branches.name,
      isMain: branches.isMain,
    })
    .from(branches)
    .where(eq(branches.status, "ACTIVE"))
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

/** เขียน branch context ลง cookie แบบ HTTP-only เพื่อไม่ให้ client ปลอมค่าโดยตรง */
export async function setCurrentBranchCookie(branchId: number) {
  await assertActiveBranch(branchId);
  (await cookies()).set(BRANCH_COOKIE, String(branchId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
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
  try {
    const result = await db.insert(branches).values({
      ...input,
      code: input.code.toUpperCase(),
      phone: input.phone || null,
      address: input.address || null,
    });
    return result[0].insertId;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Duplicate"))
      throw new BranchOperationError("รหัสสาขานี้ถูกใช้งานแล้ว", 409);
    throw error;
  }
}
