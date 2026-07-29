import { NextResponse } from "next/server";
import { z } from "zod";
import { CrmOperationError, saveMemberCrmProfile } from "@/lib/crm-service";

const profileSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  interests: z.string().trim().max(500).optional(),
  fitnessGoals: z.string().trim().max(500).optional(),
  preferredContact: z.enum(["PHONE", "LINE", "SMS", "EMAIL", "NONE"]),
});

/** ตรวจข้อมูลและบันทึกโปรไฟล์ CRM ของสมาชิก */
export async function POST(request: Request) {
  try {
    const validated = profileSchema.parse(await request.json());
    await saveMemberCrmProfile(validated);
    return NextResponse.json({ message: "บันทึกโปรไฟล์ CRM แล้ว" });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "ข้อมูลโปรไฟล์ไม่ถูกต้อง" },
        { status: 400 },
      );
    if (error instanceof CrmOperationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถบันทึกโปรไฟล์ CRM ได้" }, { status: 500 });
  }
}
