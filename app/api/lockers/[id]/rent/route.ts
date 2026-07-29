import { NextResponse } from "next/server";
import { z } from "zod";
import { LockerOperationError, rentLocker } from "@/lib/locker-service";

const rentalSchema = z
  .object({
    memberId: z.coerce.number().int().positive(),
    rentalType: z.enum(["USAGE", "MONTHLY"]),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    price: z.coerce.number().min(0).max(99999999.99),
    note: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.rentalType !== "MONTHLY" || Boolean(value.endDate), {
    message: "การเช่ารายเดือนต้องระบุวันสิ้นสุด",
    path: ["endDate"],
  })
  .refine((value) => !value.endDate || value.endDate >= value.startDate, {
    message: "วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น",
    path: ["endDate"],
  });

/** ตรวจข้อมูลการเช่าและส่งต่อให้ service ที่รับผิดชอบ transaction */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const lockerId = z.coerce.number().int().positive().parse(id);
    const validated = rentalSchema.parse(await request.json());
    const rentalId = await rentLocker({ lockerId, ...validated });
    return NextResponse.json(
      { message: "มอบล็อกเกอร์ให้สมาชิกแล้ว", rentalId },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "ข้อมูลการใช้งานไม่ถูกต้อง", details: error.issues },
        { status: 400 },
      );
    if (error instanceof LockerOperationError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error(error);
    return NextResponse.json(
      { error: "ไม่สามารถมอบล็อกเกอร์ได้" },
      { status: 500 },
    );
  }
}
