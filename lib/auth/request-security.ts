import { createHmac } from "node:crypto";

import type {
  RequestFingerprintInput,
  UserAgentCategory,
} from "@/lib/auth/types";

/** อ่านค่าความลับที่ต้องใช้ HMAC จาก environment เพื่อห้ามสร้าง fingerprint ที่เดาได้จาก source code */
function getFingerprintSecret(): string {
  const secret = process.env.AUTH_FINGERPRINT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("AUTH_FINGERPRINT_SECRET must be at least 32 bytes");
  }
  return secret;
}

/** จัดหมวดอุปกรณ์แบบหยาบเพื่อให้ audit มีประโยชน์โดยไม่เก็บ full user-agent */
function getUserAgentCategory(userAgent: string): UserAgentCategory {
  if (!userAgent) return "UNKNOWN";
  if (/bot|crawler|spider|slurp/i.test(userAgent)) return "BOT";
  if (/ipad|tablet|kindle|playbook|silk/i.test(userAgent)) return "TABLET";
  if (/mobi|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent)) {
    return "MOBILE";
  }
  return "DESKTOP";
}

/** บังคับ Origin ตรงกับ configuration เพื่อป้องกัน auth mutation จากเว็บไซต์อื่น */
export function assertTrustedOrigin(request: Request): void {
  const appOrigin = process.env.APP_ORIGIN;
  if (!appOrigin || request.headers.get("origin") !== appOrigin) {
    throw new Error("Untrusted origin");
  }
}

/** รับเฉพาะ path ภายในระบบเพื่อปิดช่อง open redirect หลัง login สำเร็จ */
export function getSafeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/";
  }
  return value;
}

/** ส่งต่อเฉพาะ HMAC ของแหล่งคำขอและหมวดอุปกรณ์ เพื่อห้าม raw IP/full user-agent หลุดสู่ storage */
export function getRequestFingerprintInput(
  request: Request,
): RequestFingerprintInput {
  const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  if (process.env.TRUST_PROXY !== "true" || !forwardedIp) {
    return {
      ipFingerprint: null,
      userAgentCategory: getUserAgentCategory(request.headers.get("user-agent") ?? ""),
    };
  }

  return {
    ipFingerprint: createHmac("sha256", getFingerprintSecret())
      .update(forwardedIp)
      .digest("hex"),
    userAgentCategory: getUserAgentCategory(request.headers.get("user-agent") ?? ""),
  };
}
