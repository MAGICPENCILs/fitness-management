import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit-service";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { getCurrentBranchId } from "@/lib/branch-service";
import { db } from "@/db";
import { deliverQueuedNotifications } from "@/lib/notification-engine";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

/** ส่งคิวของสาขาปัจจุบันผ่าน provider ที่ opt in แล้ว และบันทึกเพียงจำนวนใน audit */
export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("settings.manage", branchId, {
      action: "NOTIFICATION_DELIVERY_RUN",
      entityType: "NOTIFICATION",
    });
    const result = await deliverQueuedNotifications(branchId);
    await writeAudit(db, {
      actorStaffId: actor.staffId,
      branchId,
      action: "NOTIFICATION_DELIVERY_RUN",
      entityType: "NOTIFICATION",
      result: "SUCCESS",
      metadata: { count: result.processed, status: "COMPLETED" },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Untrusted origin")
      return NextResponse.json({ error: "คำขอไม่ผ่านการตรวจสอบความปลอดภัย" }, { status: 403 });
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("notification delivery run failed");
    return NextResponse.json({ error: "ไม่สามารถส่งคิวแจ้งเตือนได้" }, { status: 500 });
  }
}
