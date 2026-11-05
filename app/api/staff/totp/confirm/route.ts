import { NextResponse } from "next/server";
import { z } from "zod";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { getStaffContext } from "@/lib/staff-service";
import { confirmTotpEnrollment } from "@/lib/totp-service";
const schema = z.object({ code: z.string().regex(/^\d{6}$/) });
/** ยืนยัน TOTP code แรกก่อนเปิดใช้กับ Login */
export async function POST(request: Request) { try { assertTrustedOrigin(request); const context = await getStaffContext(); const { code } = schema.parse(await request.json()); await confirmTotpEnrollment({ staffId: context.staff.id, role: context.staff.role, homeBranchId: context.staff.homeBranchId }, code); return NextResponse.json({ message: "เปิดใช้ 2FA แล้ว" }); } catch { return NextResponse.json({ error: "รหัสยืนยันไม่ถูกต้อง" }, { status: 400 }); } }
