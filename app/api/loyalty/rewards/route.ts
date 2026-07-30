import { NextResponse } from "next/server";
import { z } from "zod";
import { createLoyaltyReward } from "@/lib/crm-service";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const optionalStock = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().int().min(0).max(1_000_000).optional(),
);
const rewardSchema = z.object({
  name: z.string().trim().min(2, "กรุณาระบุชื่อรางวัล").max(150),
  description: z.string().trim().max(1000).optional(),
  pointsRequired: z.coerce.number().int().min(1).max(1_000_000),
  stock: optionalStock,
});

/** ตรวจข้อมูลและสร้างของรางวัลสำหรับการแลกคะแนน */
export async function POST(request: Request) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("members.manage", branchId, { action: "LOYALTY_REWARD_CREATED", entityType: "LOYALTY_REWARD" });
    const validated = rewardSchema.parse(await request.json());
    const id = await runAuditedMutation<number>(
      { actorStaffId: actor.staffId, branchId, action: "LOYALTY_REWARD_CREATED", entityType: "LOYALTY_REWARD", success: (entityId) => ({ entityId }) },
      (tx) => createLoyaltyReward(validated, tx),
    );
    return NextResponse.json({ message: "สร้างของรางวัลแล้ว", id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "ข้อมูลรางวัลไม่ถูกต้อง" },
        { status: 400 },
      );
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถสร้างรางวัลได้" }, { status: 500 });
  }
}
