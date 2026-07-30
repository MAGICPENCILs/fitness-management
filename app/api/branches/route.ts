import { NextResponse } from "next/server";
import { z } from "zod";
import {
  BranchOperationError,
  createBranch,
  getBranchesDashboard,
} from "@/lib/branch-service";

const branchSchema = z.object({
  code: z.string().trim().min(2, "กรุณาระบุรหัสสาขา").max(20).regex(/^[A-Za-z0-9_-]+$/, "รหัสสาขาใช้ได้เฉพาะตัวอักษร ตัวเลข - และ _"),
  name: z.string().trim().min(2, "กรุณาระบุชื่อสาขา").max(150),
  phone: z.string().trim().max(20).optional(),
  address: z.string().trim().max(1000).optional(),
});

/** คืนรายการสาขาสำหรับหน้าตั้งค่า */
export async function GET() {
  return NextResponse.json(await getBranchesDashboard());
}

/** ตรวจข้อมูลและสร้างสาขาใหม่ */
export async function POST(request: Request) {
  try {
    const validated = branchSchema.parse(await request.json());
    const id = await createBranch(validated);
    return NextResponse.json({ message: "เพิ่มสาขาแล้ว", id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "ข้อมูลสาขาไม่ถูกต้อง" },
        { status: 400 },
      );
    if (error instanceof BranchOperationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถเพิ่มสาขาได้" }, { status: 500 });
  }
}
