import { completeLineLinkChallenge } from "@/lib/line-link-service";
import { isLineUserId, LineLinkError, parseLineLinkEvent, readLineWebhookBody, verifyLineSignature } from "@/lib/line-link-policy";

export const runtime = "nodejs";

/** เป็น public เฉพาะ exact path; ตรวจ bounded raw body และ HMAC ก่อน parse โดยไม่ใช้ browser Origin */
export async function POST(request: Request) {
  const secret = process.env.NOTIFICATION_LINE_CHANNEL_SECRET;
  if (!secret) return Response.json({ error: "บริการยังไม่พร้อมใช้งาน" }, { status: 503 });
  try {
    const raw = await readLineWebhookBody(request);
    if (!verifyLineSignature(raw, request.headers.get("x-line-signature"), secret)) return Response.json({ error: "ลายเซ็นไม่ถูกต้อง" }, { status: 401 });
    let envelope: unknown;
    try { envelope = JSON.parse(raw.toString("utf8")); }
    catch { return Response.json({ error: "ข้อมูลคำขอไม่ถูกต้อง" }, { status: 400 }); }
    if (!envelope || typeof envelope !== "object" || !("destination" in envelope) || !isLineUserId(envelope.destination) || !("events" in envelope) || !Array.isArray(envelope.events) || (process.env.NOTIFICATION_LINE_DESTINATION && envelope.destination !== process.env.NOTIFICATION_LINE_DESTINATION)) return Response.json({ error: "ข้อมูลคำขอไม่ถูกต้อง" }, { status: 400 });
    // แยก transaction ตามลำดับ event เพื่อให้ partial commit + redelivery ไม่ consume ซ้ำ
    for (const event of envelope.events) {
      const claim = parseLineLinkEvent(event);
      if (claim) await completeLineLinkChallenge(claim.token, claim.lineUserId);
    }
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof LineLinkError && error.status === 413) return Response.json({ error: "คำขอมีขนาดใหญ่เกินไป" }, { status: 413 });
    return Response.json({ error: "ไม่สามารถดำเนินการได้" }, { status: 500 });
  }
}
