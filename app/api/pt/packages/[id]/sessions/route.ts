import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PersonalTrainingOperationError,
  schedulePtSession,
} from "@/lib/personal-training-service";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

/** คืนวันที่ปัจจุบันตามเวลาไทยสำหรับป้องกันการนัดย้อนหลัง */
function getBangkokToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const sessionSchema = z
  .object({
    scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันนัดไม่ถูกต้อง"),
    startTime: z.string().regex(timePattern, "เวลาเริ่มไม่ถูกต้อง"),
    endTime: z.string().regex(timePattern, "เวลาจบไม่ถูกต้อง"),
  })
  .refine((value) => value.endTime > value.startTime, {
    message: "เวลาจบต้องอยู่หลังเวลาเริ่ม",
    path: ["endTime"],
  })
  .refine((value) => value.scheduledDate >= getBangkokToday(), {
    message: "ไม่สามารถนัด PT ย้อนหลังได้",
    path: ["scheduledDate"],
  });

/** นัดหมาย session ใหม่โดยให้ service ตรวจสิทธิ์และตารางทับซ้อน */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const packageId = z.coerce.number().int().positive().parse(id);
    const validated = sessionSchema.parse(await request.json());
    const sessionId = await schedulePtSession(packageId, validated);
    return NextResponse.json(
      { message: "นัดหมาย PT Session แล้ว", sessionId },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "ข้อมูลนัดหมายไม่ถูกต้อง" },
        { status: 400 },
      );
    if (error instanceof PersonalTrainingOperationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json(
      { error: "ไม่สามารถนัดหมาย PT Session ได้" },
      { status: 500 },
    );
  }
}
