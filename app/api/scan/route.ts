import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  processCardScan,
  type AccessScanResult,
} from "@/lib/access-service";
import { runAuditedMutation, writeAudit } from "@/lib/audit-service";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { getCurrentBranchId } from "@/lib/branch-service";
import {
  loadHardwareEnvironment,
  requestDoorOpen,
} from "@/lib/hardware/adapter";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const scanSchema = z.object({
  serial: z.string().trim().min(1).max(64),
});

/** ตรวจสิทธิ์และ commit access log ก่อนขอเปิดประตู เพื่อไม่ให้ hardware failure ย้อนทำข้อมูลธุรกิจเสีย */
export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("access.manage", branchId, {
      action: "ACCESS_SCAN_PROCESSED",
      entityType: "ACCESS_SCAN",
    });
    const { serial } = scanSchema.parse(await request.json());
    const method = serial.startsWith("FQR.") ? "DYNAMIC_QR" : "CARD";
    const result = await runAuditedMutation<AccessScanResult>(
      {
        actorStaffId: actor.staffId,
        branchId,
        action: "ACCESS_SCAN_PROCESSED",
        entityType: "ACCESS_SCAN",
        metadata: { method },
        success: (value) => ({
          metadata: { method, status: value.result },
        }),
      },
      (tx) => processCardScan(tx, branchId, serial),
    );
    if (result.result === "REJECTED") return NextResponse.json(result);

    const door = await requestDoorOpen(loadHardwareEnvironment());
    await writeAudit(db, {
      actorStaffId: actor.staffId,
      branchId,
      action: "DOOR_OPEN_REQUESTED",
      entityType: "ACCESS_HARDWARE",
      result: door.opened ? "SUCCESS" : "FAILED",
      metadata: { status: door.status },
    });
    return NextResponse.json({ ...result, door });
  } catch (error) {
    if (error instanceof Error && error.message === "Untrusted origin")
      return NextResponse.json(
        { error: "คำขอไม่ผ่านการตรวจสอบความปลอดภัย" },
        { status: 403 },
      );
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: "ข้อมูลบัตรไม่ถูกต้อง" }, { status: 400 });
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("access scan failed");
    return NextResponse.json(
      { error: "ไม่สามารถตรวจสิทธิ์เข้าใช้ได้" },
      { status: 500 },
    );
  }
}
