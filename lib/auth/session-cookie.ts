import { SESSION_ABSOLUTE_LIFETIME_SECONDS } from "@/lib/auth/constants";

/** กำหนด cookie กลางให้ production ส่งผ่าน HTTPS เท่านั้น ขณะที่ local development บน HTTP ยังทดสอบได้ */
export function getSessionCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_ABSOLUTE_LIFETIME_SECONDS,
  };
}
