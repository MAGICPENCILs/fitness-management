import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type LineLinkStatus = {
  status: "UNLINKED" | "PENDING" | "LINKED";
  challengeExpiresAt: string | null;
  linkedAt: string | null;
};
type LinkState = {
  lineUserId: string | null;
  challengeHash: string | null;
  challengeExpiresAt: Date | null;
  linkedAt: Date | null;
};

export class LineLinkError extends Error {
  /** เก็บเฉพาะข้อความที่ปลอดภัยสำหรับ API; ห้ามส่ง DB error หรือ identifier กลับไป */
  constructor(message: string, public status: number) { super(message); this.name = "LineLinkError"; }
}

/** จำกัดความยาวซ้ำเพื่อไม่ให้ regex ยอมรับ newline ท้าย identifier */
export function isLineUserId(value: unknown): value is string {
  return typeof value === "string" && value.length === 33 && /^U[0-9a-f]{32}$/.test(value);
}

/** รับเฉพาะรูปแบบ token ที่ออกเอง จึงไม่ normalize bearer credential */
export function isLineLinkToken(value: unknown): value is string {
  return typeof value === "string" && value.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** เก็บ hash แทน bearer token เพื่อให้ DB ไม่สามารถนำ challenge ไปใช้แทนสมาชิกได้ */
export function hashLineLinkToken(token: string) { return createHash("sha256").update(token).digest("hex"); }

/** คืน plaintext เพียงตอนออก challenge และจำกัดอายุ 15 นาทีโดยไม่เรียก provider */
export function createLineLinkChallenge(now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  return { token, challengeHash: hashLineLinkToken(token), challengeExpiresAt: new Date(now.getTime() + 15 * 60_000) };
}

/** อ่านสถานะโดยไม่เผย identifier/hash และมอง challenge หมดอายุเป็น UNLINKED โดยไม่ต้องมี scheduler */
export function lineLinkStatus(row: LinkState | undefined, now = new Date()): LineLinkStatus {
  if (row?.lineUserId && row.linkedAt && !row.challengeHash) return { status: "LINKED", challengeExpiresAt: null, linkedAt: row.linkedAt.toISOString() };
  if (row && !row.lineUserId && row.challengeHash && row.challengeExpiresAt && row.challengeExpiresAt > now) return { status: "PENDING", challengeExpiresAt: row.challengeExpiresAt.toISOString(), linkedAt: null };
  return { status: "UNLINKED", challengeExpiresAt: null, linkedAt: null };
}

/** รับเฉพาะ direct-user text ที่ตรง command ทุก byte; event อื่นเป็น no-op */
export function parseLineLinkEvent(event: unknown): { token: string; lineUserId: string } | null {
  if (!event || typeof event !== "object") return null;
  const { type, source, message } = event as { type?: unknown; source?: { type?: unknown; userId?: unknown }; message?: { type?: unknown; text?: unknown } };
  if (type !== "message" || source?.type !== "user" || !isLineUserId(source.userId) || message?.type !== "text" || typeof message.text !== "string" || !message.text.startsWith("LINK ")) return null;
  const token = message.text.slice(5);
  return isLineLinkToken(token) ? { token, lineUserId: source.userId } : null;
}

/** ตรวจ HMAC บน raw bytes แบบ fixed-length ก่อน parse เพื่อไม่ยอมรับ payload ที่ถูกแก้ไข */
export function verifyLineSignature(body: Uint8Array, signature: string | null, secret: string) {
  if (!signature || Buffer.byteLength(signature) !== 44) return false;
  const expected = createHmac("sha256", secret).update(body).digest("base64");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/** หยุด stream ทันทีเมื่อเกิน 256 KiB แม้ Content-Length หายหรือโกหก โดยไม่สะสม chunk ที่เกิน limit */
export async function readLineWebhookBody(request: Request): Promise<Buffer> {
  const limit = 256 * 1024;
  if (Number(request.headers.get("content-length")) > limit) throw new LineLinkError("คำขอมีขนาดใหญ่เกินไป", 413);
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => undefined);
        throw new LineLinkError("คำขอมีขนาดใหญ่เกินไป", 413);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally { reader.releaseLock(); }
}
