import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountingSnapshot } from "@/lib/accounting";
import { getCurrentBranchId } from "@/lib/branch-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** ส่งสรุปกำไรขาดทุนและรายการเคลื่อนไหวตามช่วงวันที่ที่ผู้ใช้เลือก */
export async function GET(request: Request) {
  try {
    const branchId = await getCurrentBranchId();
    await requirePermission("accounting.manage", branchId);
    const { searchParams } = new URL(request.url);
    const from = dateSchema.parse(searchParams.get("from"));
    const to = dateSchema.parse(searchParams.get("to"));
    if (from > to) return NextResponse.json({ error: "วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด" }, { status: 400 });
    return NextResponse.json(await getAccountingSnapshot(from, to, branchId));
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "รูปแบบช่วงวันที่ไม่ถูกต้อง" }, { status: 400 });
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถโหลดข้อมูลบัญชีได้" }, { status: 500 });
  }
}
