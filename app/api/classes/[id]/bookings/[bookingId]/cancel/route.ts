import { NextResponse } from "next/server";
import { z } from "zod";
import {
  cancelClassBooking,
  ClassOperationError,
} from "@/lib/class-service";

/** ยกเลิกรายการจองที่ยืนยันแล้วและคืนที่นั่งให้รอบคลาส */
export async function POST(
  _request: Request,
  {
    params,
  }: { params: Promise<{ id: string; bookingId: string }> },
) {
  try {
    const { id, bookingId } = await params;
    const classId = z.coerce.number().int().positive().parse(id);
    const parsedBookingId = z.coerce.number().int().positive().parse(bookingId);
    await cancelClassBooking(classId, parsedBookingId);
    return NextResponse.json({ message: "ยกเลิกการจองแล้ว" });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "รหัสรายการจองไม่ถูกต้อง" },
        { status: 400 },
      );
    if (error instanceof ClassOperationError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error(error);
    return NextResponse.json(
      { error: "ไม่สามารถยกเลิกการจองได้" },
      { status: 500 },
    );
  }
}
