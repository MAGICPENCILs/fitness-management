import { NextResponse } from "next/server";
import { z } from "zod";
import { bookClass, ClassOperationError } from "@/lib/class-service";

const bookingSchema = z.object({
  memberId: z.coerce.number().int().positive(),
});

/** ยืนยันการจองสมาชิกกับรอบคลาสที่ระบุโดยให้ service ควบคุมความจุ */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const classId = z.coerce.number().int().positive().parse(id);
    const { memberId } = bookingSchema.parse(await request.json());
    const bookingId = await bookClass(classId, memberId);
    return NextResponse.json(
      { message: "ยืนยันการจองคลาสแล้ว", bookingId },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "ข้อมูลการจองไม่ถูกต้อง" },
        { status: 400 },
      );
    if (error instanceof ClassOperationError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error(error);
    return NextResponse.json(
      { error: "ไม่สามารถจองคลาสได้" },
      { status: 500 },
    );
  }
}
