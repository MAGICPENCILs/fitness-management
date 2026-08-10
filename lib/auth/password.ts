import "server-only";

import { hash, verify } from "@node-rs/argon2";

import { ARGON2_OPTIONS, PASSWORD_MIN_LENGTH } from "@/lib/auth/constants";

export type PasswordValidation = { valid: boolean; errors: string[] };

/** ใช้ hash คงที่สำหรับบัญชีที่ไม่พบ เพื่อลดความต่างของเวลาและไม่เปิดเผยการมีอยู่ของบัญชี */
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$3koZ92UNP5XYEyw3qrboWw$YvhgRlWZmol3lWhHScZjZaZ/tQq7JLwaNPd42zLCMEc";

/** ตรวจ policy ฝั่ง server ซ้ำเสมอ เพราะ validation ฝั่ง client ไม่ใช่ security boundary */
export function validatePassword(password: string): PasswordValidation {
  const errors: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push("รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร");
  }
  if (!/[A-Z]/.test(password)) errors.push("รหัสผ่านต้องมีตัวพิมพ์ใหญ่");
  if (!/[a-z]/.test(password)) errors.push("รหัสผ่านต้องมีตัวพิมพ์เล็ก");
  if (!/\d/.test(password)) errors.push("รหัสผ่านต้องมีตัวเลข");
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push("รหัสผ่านต้องมีอักขระพิเศษ");
  }

  return { valid: errors.length === 0, errors };
}

/** สร้าง Argon2id hash ด้วยค่าต้นทุนที่กำหนดก่อนนำรหัสผ่านไปเก็บในฐานข้อมูล */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** คืน false เมื่อ hash ใช้ไม่ได้ เพื่อให้ flow login ตอบ credential failure แบบเดียวโดยไม่โยนรายละเอียดภายใน */
export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
