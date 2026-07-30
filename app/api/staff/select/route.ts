import { NextResponse } from "next/server";
import { z } from "zod";
import {
  StaffOperationError,
  setCurrentStaffCookie,
} from "@/lib/staff-service";

const selectionSchema = z.object({
  staffId: z.coerce.number().int().positive(),
});

/** ตรวจบัญชีที่เปิดใช้งานและบันทึก temporary staff context ลง cookie */
export async function POST(request: Request) {
  try {
    const { staffId } = selectionSchema.parse(await request.json());
    await setCurrentStaffCookie(staffId);
    return NextResponse.json({ message: "เปลี่ยนบัญชีพนักงานแล้ว" });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: "รหัสพนักงานไม่ถูกต้อง" }, { status: 400 });
    if (error instanceof StaffOperationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถเปลี่ยนบัญชีพนักงานได้" }, { status: 500 });
  }
}
