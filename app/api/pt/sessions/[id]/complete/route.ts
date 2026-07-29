import { NextResponse } from "next/server";
import { z } from "zod";
import {
  completePtSession,
  PersonalTrainingOperationError,
} from "@/lib/personal-training-service";

/** แปลงช่องตัวเลขว่างเป็น undefined เพื่อไม่บันทึกค่า 0 โดยไม่ตั้งใจ */
function optionalMetric(min: number, max: number) {
  return z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().min(min).max(max).optional(),
  );
}

const resultSchema = z.object({
  weightKg: optionalMetric(20, 500),
  bmi: optionalMetric(5, 100),
  waistCm: optionalMetric(20, 500),
  workoutSummary: z
    .string()
    .trim()
    .min(2, "กรุณาระบุสรุปการฝึก")
    .max(1000),
  trainerNote: z.string().trim().max(1000).optional(),
});

/** ปิด session และบันทึกผลร่างกายกับรายละเอียดการฝึก */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sessionId = z.coerce.number().int().positive().parse(id);
    const validated = resultSchema.parse(await request.json());
    await completePtSession(sessionId, validated);
    return NextResponse.json({ message: "บันทึกผล PT Session แล้ว" });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "ข้อมูลผลการฝึกไม่ถูกต้อง" },
        { status: 400 },
      );
    if (error instanceof PersonalTrainingOperationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json(
      { error: "ไม่สามารถบันทึกผล PT Session ได้" },
      { status: 500 },
    );
  }
}
