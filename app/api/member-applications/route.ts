import { NextResponse } from "next/server";
import { z } from "zod";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { getCurrentBranchId } from "@/lib/branch-service";
import {
  createMemberApplication,
  getMemberApplications,
  MemberPortalError,
} from "@/lib/member-portal-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const applicationSchema = z.object({
  branchId: z.number().int().positive(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(8).max(20),
  email: z.string().trim().email().max(191),
  password: z.string().min(1).max(1024),
  servicePrivacyConsent: z.literal(true),
  marketingConsent: z.boolean(),
});

/** รับใบสมัครและตอบข้อความเดียวกันแม้อีเมลซ้ำ เพื่อไม่เปิดเผยบัญชีที่มีอยู่ */
export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    const input = applicationSchema.parse(await request.json());
    await createMemberApplication(input);
    return NextResponse.json({ message: "รับใบสมัครแล้ว กรุณารอพนักงานตรวจสอบ" }, { status: 202 });
  } catch (error) {
    if (error instanceof Error && error.message === "Untrusted origin") return NextResponse.json({ error: "ไม่สามารถดำเนินการได้" }, { status: 403 });
    if (error instanceof MemberPortalError && error.code === "PASSWORD_POLICY") return NextResponse.json({ error: "รหัสผ่านไม่ผ่านนโยบายความปลอดภัย" }, { status: 400 });
    if (error instanceof MemberPortalError) return NextResponse.json({ error: "ข้อมูลสมัครสมาชิกไม่ถูกต้อง" }, { status: 400 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "ข้อมูลสมัครสมาชิกไม่ถูกต้อง" }, { status: 400 });
    console.error("member application unavailable");
    return NextResponse.json({ error: "ไม่สามารถรับใบสมัครได้" }, { status: 500 });
  }
}

/** คืนใบสมัครเฉพาะสาขาปัจจุบันสำหรับพนักงานที่มีสิทธิ์จัดการสมาชิก */
export async function GET() {
  try {
    const branchId = await getCurrentBranchId();
    await requirePermission("members.manage", branchId);
    return NextResponse.json(await getMemberApplications(branchId));
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "ไม่สามารถโหลดใบสมัครได้" }, { status: 500 });
  }
}
