import { NextResponse } from "next/server";
import { db } from "@/db";
import { writeAudit } from "@/lib/audit-service";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { getCurrentBranchId } from "@/lib/branch-service";
import {
  loadHardwareEnvironment,
  readCredential,
} from "@/lib/hardware/adapter";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

/** อ่านรหัสจาก controller ที่ตั้งค่าไว้ โดยไม่ส่ง URL หรือ token กลับ browser */
export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("access.manage", branchId, {
      action: "ACCESS_CREDENTIAL_READ",
      entityType: "ACCESS_HARDWARE",
    });
    const result = await readCredential(loadHardwareEnvironment());
    await writeAudit(db, {
      actorStaffId: actor.staffId,
      branchId,
      action: "ACCESS_CREDENTIAL_READ",
      entityType: "ACCESS_HARDWARE",
      result: result.status === "READ" ? "SUCCESS" : "FAILED",
      metadata: { status: result.status },
    });
    return NextResponse.json(result, {
      status: result.status === "READ" ? 200 : 503,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Untrusted origin")
      return NextResponse.json({ error: "คำขอไม่ผ่านการตรวจสอบความปลอดภัย" }, { status: 403 });
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("credential read failed");
    return NextResponse.json({ error: "ไม่สามารถอ่านอุปกรณ์ได้" }, { status: 500 });
  }
}
