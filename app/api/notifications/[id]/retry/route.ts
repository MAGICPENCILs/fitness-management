import { NextResponse } from "next/server";
import { db } from "@/db";
import { writeAudit } from "@/lib/audit-service";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { getCurrentBranchId } from "@/lib/branch-service";
import {
  NotificationDeliveryError,
  processNotificationDelivery,
} from "@/lib/notification-engine";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

/** retry รายการเดียวภายในสาขาปัจจุบัน โดย service ปฏิเสธรายการถาวร ส่งแล้ว หรือเกินจำนวนครั้ง */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertTrustedOrigin(request);
    const branchId = await getCurrentBranchId();
    const notificationId = Number((await params).id);
    if (!Number.isInteger(notificationId) || notificationId < 1)
      return NextResponse.json({ error: "รหัสรายการไม่ถูกต้อง" }, { status: 400 });
    const actor = await requirePermission("settings.manage", branchId, {
      action: "NOTIFICATION_RETRIED",
      entityType: "NOTIFICATION",
      entityId: notificationId,
    });
    const result = await processNotificationDelivery(notificationId, branchId);
    await writeAudit(db, {
      actorStaffId: actor.staffId,
      branchId,
      action: "NOTIFICATION_RETRIED",
      entityType: "NOTIFICATION",
      entityId: notificationId,
      result: "SUCCESS",
      metadata: { status: result.status },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Untrusted origin")
      return NextResponse.json({ error: "คำขอไม่ผ่านการตรวจสอบความปลอดภัย" }, { status: 403 });
    if (error instanceof NotificationDeliveryError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("notification retry failed");
    return NextResponse.json({ error: "ไม่สามารถส่งรายการซ้ำได้" }, { status: 500 });
  }
}
