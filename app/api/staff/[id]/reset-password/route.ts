import { NextResponse } from "next/server";
import { z } from "zod";

import { assertTrustedOrigin } from "@/lib/auth/request-security";
import {
  AuthorizationError,
  requirePermission,
  resetStaffPassword,
  StaffOperationError,
} from "@/lib/staff-service";
import { resetStaffPasswordSchema } from "@/lib/staff-validation";
import { isJsonSyntaxError } from "@/lib/http-error";

const idSchema = z.coerce.number().int().positive();

/** reset รหัสผ่านผ่าน authoritative guard และตอบ error แบบไม่ส่ง credential หรือรายละเอียดฐานข้อมูลกลับ client */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertTrustedOrigin(request);
    const actor = await requirePermission("staff.manage", undefined, {
      action: "PASSWORD_RESET",
      entityType: "STAFF",
    });
    const targetStaffId = idSchema.parse((await params).id);
    const input = resetStaffPasswordSchema.parse(await request.json());
    await resetStaffPassword(actor, targetStaffId, input.temporaryPassword);
    return NextResponse.json({ message: "กำหนดรหัสผ่านชั่วคราวแล้ว" });
  } catch (error) {
    if (error instanceof z.ZodError || isJsonSyntaxError(error)) {
      return NextResponse.json(
        { error: "ข้อมูลรหัสผ่านไม่ถูกต้อง" },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Untrusted origin") {
      return NextResponse.json({ error: "ไม่สามารถดำเนินการได้" }, { status: 403 });
    }
    if (error instanceof AuthorizationError || error instanceof StaffOperationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(
      "Staff password reset route unavailable",
      error instanceof Error ? error.name : "UNKNOWN_ERROR",
    );
    return NextResponse.json(
      { error: "ไม่สามารถกำหนดรหัสผ่านชั่วคราวได้" },
      { status: 500 },
    );
  }
}
