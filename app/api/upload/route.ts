import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(request: Request) {
  try {
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

    return NextResponse.json({
      url: `/uploads/members/${filename}`,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}