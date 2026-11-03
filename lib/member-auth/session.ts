import { createHash, randomBytes } from "node:crypto";

export const MEMBER_SESSION_COOKIE = "fitness_member_session";
export const MEMBER_SESSION_SECONDS = 60 * 60 * 24 * 7;

/** สร้าง opaque token แยกจาก Staff JWT เพื่อไม่ให้ claims หรือ cookie ใช้ข้าม boundary */
export function createMemberSessionToken() {
  return randomBytes(32).toString("base64url");
}

/** hash opaque token ก่อนเก็บหรือค้นฐานข้อมูล */
export function hashMemberSessionToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** ตรวจ expiry/revoke ของ Member session จาก authoritative database row */
export function isMemberSessionActive(
  expiresAt: Date,
  revokedAt: Date | null,
  now = new Date(),
) {
  return revokedAt === null && expiresAt.getTime() > now.getTime();
}

/** กำหนด cookie Member แยกชื่อและ path แต่ใช้ security flags เดียวกับ Staff */
export function getMemberSessionCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MEMBER_SESSION_SECONDS,
  };
}
