import { NextResponse } from "next/server";
import { generateNotifications } from "@/lib/notification-engine";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";
import { assertTrustedOrigin } from "@/lib/auth/request-security";

/** ประมวลผลสมาชิกที่เข้าเกณฑ์และสร้างคิวแจ้งเตือนโดยไม่สร้างรายการซ้ำ */
export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("settings.manage", branchId, {
      action: "NOTIFICATION_GENERATED",
      entityType: "NOTIFICATION",
    });
    const result = await runAuditedMutation<Awaited<ReturnType<typeof generateNotifications>>>(
      { actorStaffId: actor.staffId, branchId, action: "NOTIFICATION_GENERATED", entityType: "NOTIFICATION", success: (value) => ({ metadata: { count: value.created } }) },
      (tx) => generateNotifications(branchId, new Date(), tx),
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Untrusted origin")
      return NextResponse.json({ error: "คำขอไม่ผ่านการตรวจสอบความปลอดภัย" }, { status: 403 });
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถประมวลผลการแจ้งเตือนได้" }, { status: 500 });
  }
}
