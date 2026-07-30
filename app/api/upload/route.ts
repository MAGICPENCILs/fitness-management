import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { db } from "@/db";
import { getCurrentBranchId } from "@/lib/branch-service";
import { writeAudit } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

export async function POST(request: Request) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("members.manage", branchId, { action: "MEMBER_PHOTO_UPLOADED", entityType: "MEMBER_PHOTO" });
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const memberCode = formData.get("memberCode") as string;

    if (!file) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }

    // สร้าง folder ถ้ายังไม่มี
    const uploadDir = path.join(process.cwd(), "public", "uploads", "members");
    await mkdir(uploadDir, { recursive: true });

    // แปลงไฟล์เป็น Buffer แล้วบันทึก
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // ตั้งชื่อไฟล์จาก memberCode + นามสกุลไฟล์เดิม
    const ext = file.name.split(".").pop();
    const filename = `${memberCode}.${ext}`;
    const filepath = path.join(uploadDir, filename);

    await writeFile(filepath, buffer);
    await writeAudit(db, {
      actorStaffId: actor.staffId,
      branchId,
      action: "MEMBER_PHOTO_UPLOADED",
      entityType: "MEMBER_PHOTO",
      result: "SUCCESS",
      metadata: { fields: ["photo"] },
    });

    return NextResponse.json({
      url: `/uploads/members/${filename}`,
    });
  } catch (error) {
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
