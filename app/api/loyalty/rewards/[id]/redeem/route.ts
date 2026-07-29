import { NextResponse } from "next/server";
import { z } from "zod";
import { CrmOperationError, redeemLoyaltyReward } from "@/lib/crm-service";

const redemptionSchema = z.object({
  memberId: z.coerce.number().int().positive(),
});

/** แลกรางวัลให้สมาชิกโดยส่งการตรวจยอดและตัดสต็อกไปทำใน service transaction */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const rewardId = z.coerce.number().int().positive().parse(id);
    const { memberId } = redemptionSchema.parse(await request.json());
    const balance = await redeemLoyaltyReward(memberId, rewardId);
    return NextResponse.json({ message: "แลกรางวัลแล้ว", balance });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: "ข้อมูลการแลกรางวัลไม่ถูกต้อง" }, { status: 400 });
    if (error instanceof CrmOperationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถแลกรางวัลได้" }, { status: 500 });
  }
}
