import { NextResponse } from "next/server";
import { z } from "zod";
import {
  cancelPtSession,
  PersonalTrainingOperationError,
} from "@/lib/personal-training-service";

/** ยกเลิกนัด PT ที่ยังไม่ปิดงานและคืนโควตาให้แพ็กเกจ */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sessionId = z.coerce.number().int().positive().parse(id);
    await cancelPtSession(sessionId);
    return NextResponse.json({ message: "ยกเลิกนัด PT แล้ว" });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: "รหัส Session ไม่ถูกต้อง" }, { status: 400 });
    if (error instanceof PersonalTrainingOperationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json(
      { error: "ไม่สามารถยกเลิกนัด PT ได้" },
      { status: 500 },
    );
  }
}
