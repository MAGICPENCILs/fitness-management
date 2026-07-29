import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ClassOperationError,
  createTrainer,
} from "@/lib/class-service";

const trainerSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "กรุณาระบุรหัสเทรนเนอร์")
    .max(20)
    .regex(/^[A-Z0-9-]+$/, "รหัสใช้ได้เฉพาะ A-Z, 0-9 และขีดกลาง"),
  firstName: z.string().trim().min(1, "กรุณาระบุชื่อ").max(100),
  lastName: z.string().trim().min(1, "กรุณาระบุนามสกุล").max(100),
  specialty: z.string().trim().min(2, "กรุณาระบุความเชี่ยวชาญ").max(160),
  phone: z.string().trim().max(20).optional(),
  note: z.string().trim().max(1000).optional(),
});

/** ตรวจข้อมูลและเพิ่มเทรนเนอร์สำหรับนำไปจัดตารางสอน */
export async function POST(request: Request) {
  try {
    const validated = trainerSchema.parse(await request.json());
    const id = await createTrainer(validated);
    return NextResponse.json(
      { message: "เพิ่มเทรนเนอร์แล้ว", id },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "ข้อมูลเทรนเนอร์ไม่ถูกต้อง" },
        { status: 400 },
      );
    if (error instanceof ClassOperationError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error(error);
    return NextResponse.json(
      { error: "ไม่สามารถเพิ่มเทรนเนอร์ได้" },
      { status: 500 },
    );
  }
}
