import { NextResponse } from "next/server";
import { z } from "zod";
import { CrmOperationError, redeemLoyaltyReward } from "@/lib/crm-service";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const redemptionSchema = z.object({
  memberId: z.coerce.number().int().positive(),
});

/** แลกรางวัลให้สมาชิกโดยส่งการตรวจยอดและตัดสต็อกไปทำใน service transaction */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("members.manage", branchId, { action: "LOYALTY_REWARD_REDEEMED", entityType: "LOYALTY_REWARD" });
    const { id } = await params;
    const rewardId = z.coerce.number().int().positive().parse(id);
    const { memberId } = redemptionSchema.parse(await request.json());
    const balance = await runAuditedMutation<number>(
      { actorStaffId: actor.staffId, branchId, action: "LOYALTY_REWARD_REDEEMED", entityType: "LOYALTY_REWARD", entityId: rewardId, metadata: { memberId } },
      (tx) => redeemLoyaltyReward(memberId, rewardId, branchId, tx),
    );
    return NextResponse.json({ message: "แลกรางวัลแล้ว", balance });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: "ข้อมูลการแลกรางวัลไม่ถูกต้อง" }, { status: 400 });
    if (error instanceof CrmOperationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถแลกรางวัลได้" }, { status: 500 });
  }
}
