import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthorizationError,
  requirePermission,
  StaffOperationError,
  updateStaff,
} from "@/lib/staff-service";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { staffSchema } from "@/lib/staff-validation";
import { isJsonSyntaxError } from "@/lib/http-error";

const idSchema = z.coerce.number().int().positive();

/** ตรวจข้อมูลและแก้ไขบัญชีพนักงานภายใต้ server guard */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertTrustedOrigin(request);
    await requirePermission("staff.manage", undefined, {
      action: "STAFF_UPDATED",
      entityType: "STAFF",
    });
    const staffId = idSchema.parse((await params).id);
    const input = staffSchema.parse(await request.json());
    await updateStaff(staffId, input);
    return NextResponse.json({ message: "แก้ไขบัญชีพนักงานแล้ว" });
  } catch (error) {
    if (isJsonSyntaxError(error))
      return NextResponse.json({ error: "ข้อมูลพนักงานไม่ถูกต้อง" }, { status: 400 });
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "ข้อมูลพนักงานไม่ถูกต้อง" },
        { status: 400 },
      );
    if (error instanceof Error && error.message === "Untrusted origin")
      return NextResponse.json({ error: "ไม่สามารถดำเนินการได้" }, { status: 403 });
    if (error instanceof AuthorizationError || error instanceof StaffOperationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(
      "Staff update route unavailable",
      error instanceof Error ? error.name : "UNKNOWN_ERROR",
    );
    return NextResponse.json({ error: "ไม่สามารถแก้ไขบัญชีพนักงานได้" }, { status: 500 });
  }
}
