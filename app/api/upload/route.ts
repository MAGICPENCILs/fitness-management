import { NextResponse } from "next/server";
import { getCurrentBranchId } from "@/lib/branch-service";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { MemberPhotoError, saveMemberPhoto } from "@/lib/member-photo-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

/** ตรวจ Origin และสิทธิ์ก่อนอ่าน multipart แล้วให้ service บันทึกรูปกับ URL/Audit เพียงครั้งเดียว */
export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("members.manage", branchId, { action: "MEMBER_PHOTO_UPDATED", entityType: "MEMBER" });
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "ข้อมูลอัปโหลดไม่ถูกต้อง" }, { status: 400 });
    }
    const memberIdValue = formData.get("memberId");
    const file = formData.get("file");
    const memberId = typeof memberIdValue === "string" && /^[1-9]\d*$/.test(memberIdValue) ? Number(memberIdValue) : NaN;
    if (!Number.isSafeInteger(memberId) || !(file instanceof File))
      return NextResponse.json({ error: "ข้อมูลอัปโหลดไม่ถูกต้อง" }, { status: 400 });
    return NextResponse.json(await saveMemberPhoto({ actor, branchId, memberId, file }));
  } catch (error) {
    if (error instanceof Error && error.message === "Untrusted origin")
      return NextResponse.json({ error: "คำขอไม่ผ่านการตรวจสอบความปลอดภัย" }, { status: 403 });
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: "ไม่มีสิทธิ์อัปโหลดรูปสมาชิก" }, { status: error.status });
    if (error instanceof MemberPhotoError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "อัปโหลดรูปไม่สำเร็จ" }, { status: 500 });
  }
}
