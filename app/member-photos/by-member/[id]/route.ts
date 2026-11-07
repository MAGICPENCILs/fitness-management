import { readMemberPhoto } from "@/lib/member-photo-read-service";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/** gateway ตรวจสิทธิ์จาก DB ทุกครั้งและซ่อนสาเหตุที่ปฏิเสธไว้ใน 404 เดียวกัน โดยไม่ redirect หรือ cache */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const photo = await readMemberPhoto(id);
    if (!photo) return Response.json({ error: "ไม่พบรูปสมาชิก" }, { status: 404, headers });
    return new Response(new Uint8Array(photo.bytes), { headers: { ...headers, "Content-Type": photo.contentType } });
  } catch {
    return Response.json({ error: "อ่านรูปสมาชิกไม่สำเร็จ" }, { status: 500, headers });
  }
}
