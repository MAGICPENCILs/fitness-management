import { NextResponse } from "next/server";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { getCurrentBranchId } from "@/lib/branch-service";
import { AuthorizationError, getStaffContext } from "@/lib/staff-service";
import { punchAttendance } from "@/lib/workforce-service";
/** punch IN/OUT ของพนักงานใน session ปัจจุบัน */
export async function POST(request: Request) { try { assertTrustedOrigin(request); const branchId = await getCurrentBranchId(); const context = await getStaffContext(); const actor = { staffId: context.staff.id, role: context.staff.role, homeBranchId: context.staff.homeBranchId }; const id = await punchAttendance(actor, branchId); return NextResponse.json({ id }); } catch (error) { if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status }); return NextResponse.json({ error: "บันทึกเวลาไม่สำเร็จ" }, { status: 400 }); } }
