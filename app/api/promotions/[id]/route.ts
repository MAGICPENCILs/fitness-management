import { promotions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

// PATCH /api/promotions/[id] — toggle isActive
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("payments.manage", branchId, {
      action: "PROMOTION_UPDATED",
      entityType: "PROMOTION",
    });
    const { id } = await params;
    const body = await request.json();

    const promotionId = Number(id);
    await runAuditedMutation(
      { actorStaffId: actor.staffId, branchId, action: "PROMOTION_UPDATED", entityType: "PROMOTION", entityId: promotionId, metadata: { status: body.isActive ? "ACTIVE" : "INACTIVE" } },
      (tx) => tx.update(promotions).set({ isActive: body.isActive }).where(eq(promotions.id, promotionId)),
    );

    return NextResponse.json({ message: "Updated" });
  } catch (error) {
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
