import { NextResponse } from "next/server";
import { z } from "zod";
import { accessScanPoints } from "@/db/schema";
import { runAuditedMutation } from "@/lib/audit-service";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { getCurrentBranchId } from "@/lib/branch-service";
import { isJsonSyntaxError } from "@/lib/http-error";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const input = z.strictObject({ name: z.string().trim().min(1).max(80) });
const audit = { action: "ACCESS_SCAN_POINT_CREATED", entityType: "ACCESS_SCAN_POINT" };
class DuplicateScanPointError extends Error {}

/** รองรับทั้งข้อผิดพลาดจาก mysql2 โดยตรงและสาเหตุที่ Drizzle ห่อไว้ */
function isDuplicate(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return ("code" in error && error.code === "ER_DUP_ENTRY") || ("errno" in error && error.errno === 1062)
    || ("cause" in error && isDuplicate(error.cause));
}

/** ใช้สาขาจาก session เท่านั้น และบันทึก audit พร้อมกับจุดเพื่อไม่ให้เกิดข้อมูลที่ตรวจสอบย้อนหลังไม่ได้ */
export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("settings.manage", branchId, audit);
    const { name } = input.parse(await request.json());
    const id = await runAuditedMutation<number>(
      { ...audit, actorStaffId: actor.staffId, branchId, success: entityId => ({ entityId }) },
      async tx => {
        try {
          const [result] = await tx.insert(accessScanPoints).values({ branchId, name });
          return result.insertId;
        } catch (error) {
          if (isDuplicate(error)) throw new DuplicateScanPointError();
          throw error;
        }
      },
    );
    return NextResponse.json({ id, name }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Untrusted origin")
      return NextResponse.json({ error: "คำขอไม่ผ่านการตรวจสอบความปลอดภัย" }, { status: 403 });
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError || isJsonSyntaxError(error))
      return NextResponse.json({ error: "ข้อมูลจุดสแกนไม่ถูกต้อง" }, { status: 400 });
    if (error instanceof DuplicateScanPointError)
      return NextResponse.json({ error: "มีชื่อจุดสแกนนี้ในสาขาแล้ว" }, { status: 409 });
    return NextResponse.json({ error: "ไม่สามารถสร้างจุดสแกนได้" }, { status: 500 });
  }
}
