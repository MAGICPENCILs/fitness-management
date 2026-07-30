import { NextResponse } from "next/server";
import { z } from "zod";
import { CouponError, getCouponQuote } from "@/lib/coupon-service";
import { getCurrentBranchId } from "@/lib/branch-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const validateCouponSchema = z.object({
  code: z.string().trim().min(3).max(32),
  memberId: z.number().int().positive(),
  packageId: z.number().int().positive(),
});

/** ตรวจสิทธิ์คูปองกับสมาชิกและแพ็กเกจก่อนนำไปชำระเงินจริง */
export async function POST(request: Request) {
  try {
    const branchId = await getCurrentBranchId();
    await requirePermission("payments.manage", branchId, { action: "COUPON_VALIDATED", entityType: "COUPON" });
    const validated = validateCouponSchema.parse(await request.json());
    return NextResponse.json(await getCouponQuote(validated));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "กรุณาเลือกสมาชิก แพ็กเกจ และกรอกรหัสคูปอง" }, { status: 400 });
    }
    if (error instanceof CouponError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถตรวจสอบคูปองได้" }, { status: 500 });
  }
}
