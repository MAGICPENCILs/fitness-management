import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthorizationError,
  StaffOperationError,
  updateStaff,
} from "@/lib/staff-service";
import { staffSchema } from "@/lib/staff-validation";

const idSchema = z.coerce.number().int().positive();

/** ตรวจข้อมูลและแก้ไขบัญชีพนักงานภายใต้ server guard */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const staffId = idSchema.parse((await params).id);
    const input = staffSchema.parse(await request.json());
    await updateStaff(staffId, input);
    return NextResponse.json({ message: "แก้ไขบัญชีพนักงานแล้ว" });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "ข้อมูลพนักงานไม่ถูกต้อง" },
        { status: 400 },
      );
    if (error instanceof AuthorizationError || error instanceof StaffOperationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถแก้ไขบัญชีพนักงานได้" }, { status: 500 });
  }
}
