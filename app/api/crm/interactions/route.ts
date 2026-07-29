import { NextResponse } from "next/server";
import { z } from "zod";
import { createCrmInteraction, CrmOperationError } from "@/lib/crm-service";

const interactionSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  channel: z.enum(["NOTE", "PHONE", "LINE", "SMS", "EMAIL", "IN_PERSON"]),
  summary: z.string().trim().min(2, "กรุณาระบุรายละเอียดการติดตาม").max(1000),
  followUpDate: z
    .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
    .optional(),
});

/** ตรวจข้อมูลและเพิ่มประวัติการติดต่อสมาชิก */
export async function POST(request: Request) {
  try {
    const validated = interactionSchema.parse(await request.json());
    const id = await createCrmInteraction(validated);
    return NextResponse.json({ message: "บันทึกการติดตามแล้ว", id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "ข้อมูลการติดตามไม่ถูกต้อง" },
        { status: 400 },
      );
    if (error instanceof CrmOperationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถบันทึกการติดตามได้" }, { status: 500 });
  }
}
