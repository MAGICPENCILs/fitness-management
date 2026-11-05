import { createHash, randomBytes } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";

import type { SessionClaims } from "@/lib/auth/types";

const SESSION_ROLES: readonly string[] = [
  "OWNER",
  "MANAGER",
  "COUNTER",
  "TRAINER",
];

/** อ่าน secret จาก environment และหยุด flow หากค่าว่างหรืออ่อนเกินไป แทนการใช้ fallback ใน source code */
function getSessionSecret(): Uint8Array {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("AUTH_SESSION_SECRET must be at least 32 bytes");
  }
  return new TextEncoder().encode(secret);
}

/** สร้าง session ID 256-bit ใหม่ทุกครั้งเพื่อกันการเดาและ session fixation */
export function createSessionId(): string {
  return randomBytes(32).toString("base64url");
}

/** เก็บเฉพาะ SHA-256 ของ session ID ในฐานข้อมูล เพื่อไม่ให้ token ใช้งานได้หลุดจาก storage */
export function hashSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex");
}

/** ตัดเศษวินาทีก่อนเซ็นและบันทึก session เพื่อให้ JWT ตรงกับ MySQL TIMESTAMP ที่ไม่มี fractional precision */
export function normalizeSessionTimestamp(value: Date): Date {
  return new Date(Math.floor(value.getTime() / 1_000) * 1_000);
}

/** เซ็นเฉพาะ claims ขั้นต่ำที่ proxy ใช้ตัดสินใจเบื้องต้น โดยการตรวจ authoritative อยู่ที่ DAL */
export async function signSessionClaims(
  claims: SessionClaims,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .sign(getSessionSecret());
}

/** ปฏิเสธ cookie ที่ลายเซ็นหรือ payload ไม่ถูกต้องโดยไม่เปิดเผยสาเหตุให้ผู้เรียก */
export async function verifySessionClaims(
  cookie: string,
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(cookie, getSessionSecret(), {
      algorithms: ["HS256"],
    });

    if (
      typeof payload.sessionId !== "string" ||
      typeof payload.staffId !== "number" ||
      typeof payload.role !== "string" ||
      !SESSION_ROLES.includes(payload.role) ||
      typeof payload.homeBranchId !== "number" ||
      (payload.mode !== "FULL" && payload.mode !== "PASSWORD_CHANGE_REQUIRED") ||
      typeof payload.expiresAt !== "number"
    ) {
      return null;
    }

    return {
      sessionId: payload.sessionId,
      staffId: payload.staffId,
      role: payload.role as SessionClaims["role"],
      homeBranchId: payload.homeBranchId,
      mode: payload.mode,
      expiresAt: payload.expiresAt,
    };
  } catch {
    return null;
  }
}
