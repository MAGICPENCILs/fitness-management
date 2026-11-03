import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthorizationError,
  createStaff,
  getStaffDashboard,
  requirePermission,
  StaffOperationError,
} from "@/lib/staff-service";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { createStaffSchema } from "@/lib/staff-validation";
import { isJsonSyntaxError } from "@/lib/http-error";

/** แปลงข้อผิดพลาดที่คาดหมายเป็น JSON โดยไม่เปิดเผยรายละเอียดภายในระบบ */
function staffErrorResponse(error: unknown, fallback: string) {
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
    "Staff route unavailable",
    error instanceof Error ? error.name : "UNKNOWN_ERROR",
  );
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/** คืนรายการพนักงานตามขอบเขต RBAC ของบัญชีปัจจุบัน */
export async function GET() {
  try {
    return NextResponse.json(await getStaffDashboard());
  } catch (error) {
    return staffErrorResponse(error, "ไม่สามารถโหลดบัญชีพนักงานได้");
  }
}

/** ตรวจข้อมูลและสร้างบัญชีพนักงานภายใต้ server guard */
export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    await requirePermission("staff.manage", undefined, {
      action: "STAFF_CREATED",
      entityType: "STAFF",
    });
    const input = createStaffSchema.parse(await request.json());
    const id = await createStaff(input);
    return NextResponse.json({ message: "เพิ่มบัญชีพนักงานแล้ว", id }, { status: 201 });
  } catch (error) {
    return staffErrorResponse(error, "ไม่สามารถเพิ่มบัญชีพนักงานได้");
  }
}
