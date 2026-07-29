import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { lockers, NewLocker } from "@/db/schema";

const createLockerSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1)
    .max(20)
    .regex(/^[A-Z0-9-]+$/),
  zone: z.string().trim().min(1).max(50),
  monthlyRate: z.coerce.number().min(0).max(99999999.99).optional(),
  note: z.string().trim().max(500).optional(),
});

/** เพิ่มล็อกเกอร์ใหม่โดยกันรหัสซ้ำก่อนเขียน เพื่อส่งข้อความที่แก้ไขได้ชัดเจน */
export async function POST(request: Request) {
  try {
    const validated = createLockerSchema.parse(await request.json());
    const [existing] = await db
      .select({ id: lockers.id })
      .from(lockers)
      .where(eq(lockers.code, validated.code))
      .limit(1);
    if (existing)
      return NextResponse.json(
        { error: "รหัสล็อกเกอร์นี้มีอยู่แล้ว" },
        { status: 409 },
      );

    const newLocker: NewLocker = {
      code: validated.code,
      zone: validated.zone,
      monthlyRate:
        validated.monthlyRate === undefined
          ? null
          : String(validated.monthlyRate),
      note: validated.note || null,
    };
    const result = await db.insert(lockers).values(newLocker);
    return NextResponse.json(
      { message: "เพิ่มล็อกเกอร์แล้ว", id: result[0].insertId },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "ข้อมูลล็อกเกอร์ไม่ถูกต้อง", details: error.issues },
        { status: 400 },
      );
    console.error(error);
    return NextResponse.json(
      { error: "ไม่สามารถเพิ่มล็อกเกอร์ได้" },
      { status: 500 },
    );
  }
}
