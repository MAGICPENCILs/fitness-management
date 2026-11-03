import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { getCurrentBranchId } from "@/lib/branch-service";
import {
  revokeMemberAccessTokens,
  rotateMemberAccessToken,
} from "@/lib/membership-lifecycle-service";
import { MembershipLifecycleError } from "@/lib/membership-lifecycle";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

/** หมุน token แล้วสร้าง QR จาก raw token ใน memory โดยฐานข้อมูลเก็บเฉพาะ hash */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedOrigin(request);
    const branchId = await getCurrentBranchId();
    const memberId = Number((await params).id);
    const actor = await requirePermission("members.manage", branchId, { action: "MEMBER_QR_ROTATED", entityType: "MEMBER_ACCESS_TOKEN" });
    const token = await rotateMemberAccessToken(actor, branchId, memberId);
    const qrDataUrl = await QRCode.toDataURL(token.token, { width: 320, margin: 1, errorCorrectionLevel: "M" });
    return NextResponse.json({ id: token.id, expiresAt: token.expiresAt.toISOString(), qrDataUrl });
  } catch (error) {
    if (error instanceof Error && error.message === "Untrusted origin") return NextResponse.json({ error: "คำขอไม่ผ่านการตรวจสอบความปลอดภัย" }, { status: 403 });
    if (error instanceof MembershipLifecycleError) return NextResponse.json({ error: "ไม่พบสมาชิกที่ออก QR ได้" }, { status: 404 });
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("member QR rotation failed");
    return NextResponse.json({ error: "ไม่สามารถสร้าง Dynamic QR ได้" }, { status: 500 });
  }
}

/** revoke Dynamic QR ที่ยัง active ทั้งหมดของสมาชิก */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedOrigin(request);
    const branchId = await getCurrentBranchId();
    const memberId = Number((await params).id);
    const actor = await requirePermission("members.manage", branchId, { action: "MEMBER_QR_REVOKED", entityType: "MEMBER_ACCESS_TOKEN" });
    await revokeMemberAccessTokens(actor, branchId, memberId);
    return NextResponse.json({ message: "ยกเลิก Dynamic QR แล้ว" });
  } catch (error) {
    if (error instanceof Error && error.message === "Untrusted origin") return NextResponse.json({ error: "คำขอไม่ผ่านการตรวจสอบความปลอดภัย" }, { status: 403 });
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("member QR revocation failed");
    return NextResponse.json({ error: "ไม่สามารถยกเลิก Dynamic QR ได้" }, { status: 500 });
  }
}
