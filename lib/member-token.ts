import { createHash, randomBytes } from "node:crypto";

/** hash raw token ก่อน query/บันทึก เพื่อไม่ให้ฐานข้อมูลมี credential ที่นำไปใช้สแกนได้ */
export function hashMemberAccessToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** สร้าง token อายุ 5 นาทีสำหรับ QR บนมือถือและคืน hash แยกจาก raw token ที่แสดงครั้งเดียว */
export function createMemberAccessToken(now = new Date()) {
  const token = `FQR.${randomBytes(32).toString("base64url")}`;
  return {
    token,
    tokenHash: hashMemberAccessToken(token),
    expiresAt: new Date(now.getTime() + 5 * 60_000),
  };
}

/** ตรวจเวลาและ revoke state ก่อนยอมรับ token; การเทียบ hash ทำใน query ฐานข้อมูล */
export function isMemberAccessTokenUsable(
  expiresAt: Date,
  revokedAt: Date | null,
  now = new Date(),
) {
  return revokedAt === null && expiresAt.getTime() > now.getTime();
}
