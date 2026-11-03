import { NextResponse } from "next/server";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { getStaffContext } from "@/lib/staff-service";
import { startTotpEnrollment } from "@/lib/totp-service";
/** เริ่ม TOTP enrollment ของบัญชีใน session ปัจจุบันเท่านั้น */
export async function POST(request: Request) { try { assertTrustedOrigin(request); const context = await getStaffContext(); return NextResponse.json(await startTotpEnrollment({ staffId: context.staff.id, role: context.staff.role, homeBranchId: context.staff.homeBranchId })); } catch { return NextResponse.json({ error: "ไม่สามารถเริ่มตั้งค่า 2FA ได้" }, { status: 400 }); } }
