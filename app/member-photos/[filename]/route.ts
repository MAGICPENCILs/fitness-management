export const dynamic = "force-dynamic";

/** URL filename เดิมหมดสิทธิ์อ่านโดยตรง แม้ทราบ token; รูปเดิมยังอ่านได้ผ่าน gateway ที่ตรวจสมาชิก */
export async function GET() {
  return Response.json({ error: "ไม่พบรูปสมาชิก" }, {
    status: 404,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
