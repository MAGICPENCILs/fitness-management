import { NextResponse } from "next/server";
import { getCurrentBranchId } from "@/lib/branch-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

/** ปิด endpoint เก่าที่สร้างสิทธิ์ ACTIVE โดยไม่มี payment/receipt; ทุกการขายต้องผ่าน /api/payments */
export async function POST() {
  try {
    const branchId = await getCurrentBranchId();
    await requirePermission("payments.manage", branchId);
    return NextResponse.json(
      { error: "กรุณาบันทึกการขายผ่านระบบชำระเงิน" },
      { status: 410 },
    );
  } catch (error) {
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "ไม่สามารถดำเนินการได้" }, { status: 500 });
  }
}
