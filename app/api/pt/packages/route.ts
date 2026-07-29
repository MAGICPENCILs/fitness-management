import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createPtPackage,
  PersonalTrainingOperationError,
} from "@/lib/personal-training-service";

const packageSchema = z
  .object({
    memberId: z.coerce.number().int().positive(),
    trainerId: z.coerce.number().int().positive(),
    name: z.string().trim().min(2, "กรุณาระบุชื่อ PT Package").max(120),
    totalSessions: z.coerce.number().int().min(1).max(100),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่เริ่มไม่ถูกต้อง"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันหมดอายุไม่ถูกต้อง"),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: "วันหมดอายุต้องไม่ก่อนวันที่เริ่ม",
    path: ["endDate"],
  })
  .refine((value) => value.endDate >= getBangkokToday(), {
    message: "ไม่สามารถออกแพ็กเกจที่หมดอายุแล้วได้",
    path: ["endDate"],
  });

/** คืนวันที่ปัจจุบันตามเวลาไทยสำหรับป้องกันการออกแพ็กเกจที่หมดอายุ */
function getBangkokToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** ตรวจข้อมูลและออก PT Package ให้สมาชิกกับเทรนเนอร์ที่เลือก */
export async function POST(request: Request) {
  try {
    const validated = packageSchema.parse(await request.json());
    const id = await createPtPackage(validated);
    return NextResponse.json(
      { message: "ออก PT Package แล้ว", id },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "ข้อมูล PT Package ไม่ถูกต้อง" },
        { status: 400 },
      );
    if (error instanceof PersonalTrainingOperationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json(
      { error: "ไม่สามารถออก PT Package ได้" },
      { status: 500 },
    );
  }
}
