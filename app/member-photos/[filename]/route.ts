import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { resolveMemberPhotoPath } from "@/lib/member-photo-path";

export const dynamic = "force-dynamic";

/** อ่านรูป opaque ณ เวลา request แทน public snapshot เพื่อให้ next start เห็นรูปใหม่โดยไม่ restart */
export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  const filePath = resolveMemberPhotoPath(`/member-photos/${filename}`);
  if (!filePath) return NextResponse.json({ error: "ไม่พบรูปสมาชิก" }, { status: 404 });
  try {
    const bytes = await readFile(filePath);
    const contentType = filename.endsWith(".jpg") ? "image/jpeg" : filename.endsWith(".png") ? "image/png" : "image/webp";
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": contentType, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return NextResponse.json({ error: "ไม่พบรูปสมาชิก" }, { status: 404 });
    return NextResponse.json({ error: "อ่านรูปสมาชิกไม่สำเร็จ" }, { status: 500 });
  }
}
