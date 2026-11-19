import { NextResponse } from "next/server";
import { z } from "zod";
import { accessSettings } from "@/db/schema";
import { getAccessSettings } from "@/lib/access-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { getCurrentBranchId } from "@/lib/branch-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const accessSettingsSchema = z.object({ graceDays: z.number().int().min(3).max(7) }).strict();

/** โหลดกฎเข้าใช้ปัจจุบันให้ผู้มีสิทธิ์ตั้งค่าระบบ */
export async function GET() {
  try {
    const branchId = await getCurrentBranchId();
    await requirePermission("settings.manage", branchId);
    return NextResponse.json(await getAccessSettings());
  } catch (error) {
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "ไม่สามารถโหลดการตั้งค่าได้" }, { status: 500 });
  }
}

/** บันทึก Grace Period แบบ singleton พร้อม audit โดยรับเฉพาะช่วงที่ธุรกิจกำหนด */
export async function PATCH(request: Request) {
  try {
    assertTrustedOrigin(request);
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("settings.manage", branchId, {
      action: "ACCESS_SETTINGS_UPDATED",
      entityType: "ACCESS_SETTINGS",
    });
    const validated = accessSettingsSchema.parse(await request.json());
    await runAuditedMutation(
      {
        actorStaffId: actor.staffId,
        branchId,
        action: "ACCESS_SETTINGS_UPDATED",
        entityType: "ACCESS_SETTINGS",
        entityId: 1,
        metadata: { graceDays: validated.graceDays },
      },
      (tx) => tx.insert(accessSettings).values({ id: 1, graceDays: validated.graceDays })
        .onDuplicateKeyUpdate({ set: { graceDays: validated.graceDays } }),
    );
    return NextResponse.json({ message: "บันทึกการตั้งค่าแล้ว", settings: { id: 1, ...validated } });
  } catch (error) {
    if (error instanceof Error && error.message === "Untrusted origin")
      return NextResponse.json({ error: "คำขอไม่ผ่านการตรวจสอบความปลอดภัย" }, { status: 403 });
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: "Grace Period ต้องเป็นจำนวนเต็ม 3–7 วัน", details: error.issues }, { status: 400 });
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "ไม่สามารถบันทึกการตั้งค่าได้" }, { status: 500 });
  }
}
