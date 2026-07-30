import { NextResponse } from "next/server";
import { z } from "zod";
import { completeCrmInteraction, CrmOperationError } from "@/lib/crm-service";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

/** ปิดงานติดตามตามรหัสรายการที่ส่งผ่าน dynamic route */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("members.manage", branchId, { action: "CRM_INTERACTION_COMPLETED", entityType: "CRM_INTERACTION" });
    const { id } = await params;
    const interactionId = z.coerce.number().int().positive().parse(id);
    await runAuditedMutation(
      { actorStaffId: actor.staffId, branchId, action: "CRM_INTERACTION_COMPLETED", entityType: "CRM_INTERACTION", entityId: interactionId, metadata: { status: "COMPLETED" } },
      (tx) => completeCrmInteraction(interactionId, branchId, tx),
    );
    return NextResponse.json({ message: "ปิดงานติดตามแล้ว" });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: "รหัสงานติดตามไม่ถูกต้อง" }, { status: 400 });
    if (error instanceof CrmOperationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถปิดงานติดตามได้" }, { status: 500 });
  }
}
