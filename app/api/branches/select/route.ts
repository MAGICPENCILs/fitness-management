import { NextResponse } from "next/server";
import { z } from "zod";
import {
  BranchOperationError,
  setCurrentBranchCookie,
} from "@/lib/branch-service";

const selectionSchema = z.object({
  branchId: z.coerce.number().int().positive(),
});

/** ตรวจสาขาและบันทึกบริบทที่เลือกลง cookie ของผู้ใช้ */
export async function POST(request: Request) {
  try {
    const { branchId } = selectionSchema.parse(await request.json());
    await setCurrentBranchCookie(branchId);
    return NextResponse.json({ message: "เปลี่ยนสาขาแล้ว" });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: "รหัสสาขาไม่ถูกต้อง" }, { status: 400 });
    if (error instanceof BranchOperationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถเปลี่ยนสาขาได้" }, { status: 500 });
  }
}
