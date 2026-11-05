import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentBranchId } from "@/lib/branch-service";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { isJsonSyntaxError } from "@/lib/http-error";
import {
  getReceiptSettingsDashboard,
  saveReceiptSettings,
} from "@/lib/receipt-data";
import { receiptSettingsInputSchema } from "@/lib/receipt-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

/** คืนค่าผู้ออกใบเสร็จของสาขาปัจจุบันหลังตรวจสิทธิ์บนเซิร์ฟเวอร์ */
export async function GET() {
  try {
    const branchId = await getCurrentBranchId();
    await requirePermission("settings.manage", branchId);
    return NextResponse.json(await getReceiptSettingsDashboard(branchId));
  } catch (error) {
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถโหลดการตั้งค่าใบเสร็จได้" }, { status: 500 });
  }
}

/** ตรวจและบันทึกข้อมูลนิติบุคคล โดยไม่รับ branch id จาก browser เพื่อป้องกันแก้ข้ามสาขา */
export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("settings.manage", branchId, {
      action: "RECEIPT_SETTINGS_UPDATED",
      entityType: "BRANCH_RECEIPT_SETTINGS",
      entityId: branchId,
    });
    const input = receiptSettingsInputSchema.parse(await request.json());
    await saveReceiptSettings(actor, branchId, input);
    return NextResponse.json({ message: "บันทึกการตั้งค่าใบเสร็จแล้ว" });
  } catch (error) {
    if (error instanceof Error && error.message === "Untrusted origin")
      return NextResponse.json({ error: "คำขอไม่ผ่านการตรวจสอบความปลอดภัย" }, { status: 403 });
    if (error instanceof z.ZodError || isJsonSyntaxError(error))
      return NextResponse.json(
        { error: error instanceof z.ZodError ? error.issues[0]?.message : "ข้อมูลไม่ถูกต้อง" },
        { status: 400 },
      );
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถบันทึกการตั้งค่าใบเสร็จได้" }, { status: 500 });
  }
}
