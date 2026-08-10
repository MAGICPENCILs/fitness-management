import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { couponCodes } from "@/db/schema";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const updateCouponSchema = z.object({ isActive: z.boolean() });

/** เปิดหรือปิดการใช้งานคูปองตามรหัสภายในระบบ */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("payments.manage", branchId, {
      action: "COUPON_UPDATED",
      entityType: "COUPON",
    });
    const { id } = await params;
    const couponId = Number(id);
    if (!Number.isInteger(couponId) || couponId <= 0) {
      return NextResponse.json({ error: "รหัสคูปองไม่ถูกต้อง" }, { status: 400 });
    }
    const validated = updateCouponSchema.parse(await request.json());
    await runAuditedMutation(
      { actorStaffId: actor.staffId, branchId, action: "COUPON_UPDATED", entityType: "COUPON", entityId: couponId, metadata: { status: validated.isActive ? "ACTIVE" : "INACTIVE" } },
      async (tx) => {
        const result = await tx.update(couponCodes).set({ isActive: validated.isActive }).where(eq(couponCodes.id, couponId));
        if (result[0].affectedRows === 0) throw new Error("COUPON_NOT_FOUND");
      },
    );
    return NextResponse.json({ message: "อัปเดตคูปองแล้ว" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message === "COUPON_NOT_FOUND")
      return NextResponse.json({ error: "ไม่พบคูปอง" }, { status: 404 });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถอัปเดตคูปองได้" }, { status: 500 });
  }
}
