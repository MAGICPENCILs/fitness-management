import { NextResponse } from "next/server";
import { generateNotifications } from "@/lib/notification-engine";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

/** ประมวลผลสมาชิกที่เข้าเกณฑ์และสร้างคิวแจ้งเตือนโดยไม่สร้างรายการซ้ำ */
export async function POST() {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("settings.manage", branchId, {
      action: "NOTIFICATION_GENERATED",
      entityType: "NOTIFICATION",
    });
    const result = await runAuditedMutation<Awaited<ReturnType<typeof generateNotifications>>>(
      { actorStaffId: actor.staffId, branchId, action: "NOTIFICATION_GENERATED", entityType: "NOTIFICATION", success: (value) => ({ metadata: { count: value.created } }) },
      (tx) => generateNotifications(new Date(), tx),
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถประมวลผลการแจ้งเตือนได้" }, { status: 500 });
  }
}
