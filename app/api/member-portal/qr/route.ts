import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { requireMemberSession } from "@/lib/member-auth/service";
import { rotateSelfMemberAccessToken } from "@/lib/membership-lifecycle-service";

/** ออก Dynamic QR ให้สมาชิกใน session ปัจจุบันเท่านั้น */
export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    const member = await requireMemberSession();
    const token = await rotateSelfMemberAccessToken(member.memberId, member.branchId);
    const qrDataUrl = await QRCode.toDataURL(token.token, { width: 320, margin: 1, errorCorrectionLevel: "M" });
    return NextResponse.json({ qrDataUrl, expiresAt: token.expiresAt.toISOString() });
  } catch (error) {
    if (error instanceof Error && error.message === "Untrusted origin") return NextResponse.json({ error: "ไม่สามารถดำเนินการได้" }, { status: 403 });
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบสมาชิกอีกครั้ง" }, { status: 401 });
  }
}
