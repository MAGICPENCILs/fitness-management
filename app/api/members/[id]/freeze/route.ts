import { NextResponse } from "next/server";
import { z } from "zod";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { getCurrentBranchId } from "@/lib/branch-service";
import {
  freezeMembership,
  unfreezeMembership,
} from "@/lib/membership-lifecycle-service";
import { MembershipLifecycleError } from "@/lib/membership-lifecycle";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const freezeSchema = z.object({
  memberPackageId: z.number().int().positive(),
  days: z.number().int().min(1).max(30),
  reason: z.string().trim().min(3).max(500),
});

/** แปลงรหัส lifecycle เป็นข้อความที่ใช้หน้าจอได้โดยไม่เผยรายละเอียดฐานข้อมูล */
function lifecycleError(error: MembershipLifecycleError) {
  const messages: Record<string, string> = {
    FREEZE_LIMIT_EXCEEDED: "จำนวนวัน Freeze รวมปีนี้เกิน 30 วัน",
    FREEZE_ALREADY_ACTIVE: "สมาชิกมีรายการ Freeze ที่ยังไม่สิ้นสุด",
    MEMBER_NOT_ACTIVE: "สมาชิกไม่อยู่ในสถานะที่ Freeze ได้",
    PACKAGE_NOT_ACTIVE: "แพ็กเกจไม่อยู่ในสถานะที่ Freeze ได้",
    FREEZE_NOT_ACTIVE: "ไม่พบรายการ Freeze ที่กำลังใช้งาน",
  };
  return messages[error.code] ?? "ไม่สามารถเปลี่ยนสถานะ Freeze ได้";
}

/** เริ่ม Freeze แพ็กเกจของสมาชิกในสาขาปัจจุบัน */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedOrigin(request);
    const branchId = await getCurrentBranchId();
    const memberId = Number((await params).id);
    const actor = await requirePermission("members.manage", branchId, { action: "MEMBERSHIP_FROZEN", entityType: "FREEZE_RECORD" });
    const input = freezeSchema.parse(await request.json());
    const id = await freezeMembership(actor, branchId, { memberId, ...input });
    return NextResponse.json({ id, message: "Freeze สมาชิกแล้ว" }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Untrusted origin") return NextResponse.json({ error: "คำขอไม่ผ่านการตรวจสอบความปลอดภัย" }, { status: 403 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "ข้อมูล Freeze ไม่ถูกต้อง" }, { status: 400 });
    if (error instanceof MembershipLifecycleError) return NextResponse.json({ error: lifecycleError(error) }, { status: 409 });
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("membership freeze failed");
    return NextResponse.json({ error: "ไม่สามารถ Freeze สมาชิกได้" }, { status: 500 });
  }
}

/** จบ Freeze และต่อวันหมดอายุของแพ็กเกจ */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedOrigin(request);
    const branchId = await getCurrentBranchId();
    const memberId = Number((await params).id);
    const actor = await requirePermission("members.manage", branchId, { action: "MEMBERSHIP_UNFROZEN", entityType: "FREEZE_RECORD" });
    const id = await unfreezeMembership(actor, branchId, memberId);
    return NextResponse.json({ id, message: "Unfreeze และต่อวันหมดอายุแล้ว" });
  } catch (error) {
    if (error instanceof Error && error.message === "Untrusted origin") return NextResponse.json({ error: "คำขอไม่ผ่านการตรวจสอบความปลอดภัย" }, { status: 403 });
    if (error instanceof MembershipLifecycleError) return NextResponse.json({ error: lifecycleError(error) }, { status: 409 });
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("membership unfreeze failed");
    return NextResponse.json({ error: "ไม่สามารถ Unfreeze สมาชิกได้" }, { status: 500 });
  }
}
