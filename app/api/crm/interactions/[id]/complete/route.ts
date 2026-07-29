import { NextResponse } from "next/server";
import { z } from "zod";
import { completeCrmInteraction, CrmOperationError } from "@/lib/crm-service";

/** ปิดงานติดตามตามรหัสรายการที่ส่งผ่าน dynamic route */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await completeCrmInteraction(z.coerce.number().int().positive().parse(id));
    return NextResponse.json({ message: "ปิดงานติดตามแล้ว" });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: "รหัสงานติดตามไม่ถูกต้อง" }, { status: 400 });
    if (error instanceof CrmOperationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถปิดงานติดตามได้" }, { status: 500 });
  }
}
