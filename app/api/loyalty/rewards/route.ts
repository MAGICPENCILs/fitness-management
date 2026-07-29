import { NextResponse } from "next/server";
import { z } from "zod";
import { createLoyaltyReward } from "@/lib/crm-service";

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
    const validated = rewardSchema.parse(await request.json());
    const id = await createLoyaltyReward(validated);
    return NextResponse.json({ message: "สร้างของรางวัลแล้ว", id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "ข้อมูลรางวัลไม่ถูกต้อง" },
        { status: 400 },
      );
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถสร้างรางวัลได้" }, { status: 500 });
  }
}
