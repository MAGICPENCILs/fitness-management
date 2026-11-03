import { NextResponse } from "next/server";
import { z } from "zod";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { getCurrentBranchId } from "@/lib/branch-service";
import { MemberPortalError, reviewMemberApplication } from "@/lib/member-portal-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const reviewSchema = z.object({ decision: z.enum(["APPROVE", "REJECT"]), reviewNote: z.string().trim().max(500).optional() });

/** อนุมัติ/ปฏิเสธใบสมัครโดยสร้าง Member account เฉพาะตอนอนุมัติ */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedOrigin(request);
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("members.manage", branchId, { action: "MEMBER_APPLICATION_REVIEWED", entityType: "MEMBER_APPLICATION" });
    const input = reviewSchema.parse(await request.json());
    const id = await reviewMemberApplication(actor, branchId, Number((await params).id), input.decision, input.reviewNote);
    return NextResponse.json({ id, message: input.decision === "APPROVE" ? "อนุมัติใบสมัครแล้ว" : "ปฏิเสธใบสมัครแล้ว" });
  } catch (error) {
    if (error instanceof Error && error.message === "Untrusted origin") return NextResponse.json({ error: "คำขอไม่ผ่านการตรวจสอบความปลอดภัย" }, { status: 403 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "ข้อมูลตรวจสอบไม่ถูกต้อง" }, { status: 400 });
    if (error instanceof MemberPortalError) return NextResponse.json({ error: "ใบสมัครไม่อยู่ในสถานะที่ดำเนินการได้" }, { status: 409 });
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("member application review failed");
    return NextResponse.json({ error: "ไม่สามารถตรวจสอบใบสมัครได้" }, { status: 500 });
  }
}
