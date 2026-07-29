import { NextResponse } from "next/server";
import { z } from "zod";
import { CouponError, getCouponQuote } from "@/lib/coupon-service";

const validateCouponSchema = z.object({
  code: z.string().trim().min(3).max(32),
  memberId: z.number().int().positive(),
  packageId: z.number().int().positive(),
});

export async function POST(request: Request) {
  try {
    const validated = validateCouponSchema.parse(await request.json());
    return NextResponse.json(await getCouponQuote(validated));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "กรุณาเลือกสมาชิก แพ็กเกจ และกรอกรหัสคูปอง" }, { status: 400 });
    }
    if (error instanceof CouponError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถตรวจสอบคูปองได้" }, { status: 500 });
  }
}
