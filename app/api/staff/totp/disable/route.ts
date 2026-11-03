import { NextResponse } from "next/server";
import { z } from "zod";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { getStaffContext } from "@/lib/staff-service";
import { disableTotp } from "@/lib/totp-service";
const schema = z.object({ code: z.string().trim().min(6).max(64) });
/** ปิด 2FA หลังยืนยัน authenticator/recovery code */
export async function POST(request: Request) { try { assertTrustedOrigin(request); const context = await getStaffContext(); const { code } = schema.parse(await request.json()); await disableTotp({ staffId: context.staff.id, role: context.staff.role, homeBranchId: context.staff.homeBranchId }, code); return NextResponse.json({ message: "ปิด 2FA แล้ว" }); } catch { return NextResponse.json({ error: "ไม่สามารถปิด 2FA ได้" }, { status: 400 }); } }
