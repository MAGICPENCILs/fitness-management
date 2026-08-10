import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthorizationError,
  createStaff,
  getStaffDashboard,
  requirePermission,
  StaffOperationError,
} from "@/lib/staff-service";
import { staffSchema } from "@/lib/staff-validation";

/** แปลงข้อผิดพลาดที่คาดหมายเป็น JSON โดยไม่เปิดเผยรายละเอียดภายในระบบ */
function staffErrorResponse(error: unknown, fallback: string) {
  if (error instanceof z.ZodError)
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "ข้อมูลพนักงานไม่ถูกต้อง" },
      { status: 400 },
    );
  if (error instanceof AuthorizationError || error instanceof StaffOperationError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(error);
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
    await requirePermission("staff.manage", undefined, {
      action: "STAFF_CREATED",
      entityType: "STAFF",
    });
    const input = staffSchema.parse(await request.json());
    const id = await createStaff(input);
    return NextResponse.json({ message: "เพิ่มบัญชีพนักงานแล้ว", id }, { status: 201 });
  } catch (error) {
    return staffErrorResponse(error, "ไม่สามารถเพิ่มบัญชีพนักงานได้");
  }
}
