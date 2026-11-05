import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

/** กันการเขียนทับ factor ที่ใช้งานอยู่จนกว่าผู้ใช้จะยืนยันปิดด้วยรหัสเดิม */
export function assertTotpEnrollmentAllowed(status: "PENDING" | "ENABLED" | "DISABLED" | undefined) {
  if (status === "ENABLED") throw new Error("TOTP_ALREADY_ENABLED");
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** สร้าง Base32 secret จาก entropy 20 bytes สำหรับแอป Authenticator */
export function generateTotpSecret() {
  let bits = "";
  for (const byte of randomBytes(20)) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let offset = 0; offset < bits.length; offset += 5)
    output += BASE32_ALPHABET[Number.parseInt(bits.slice(offset, offset + 5).padEnd(5, "0"), 2)];
  return output;
}

/** เข้ารหัส TOTP secret ด้วย AES-256-GCM ก่อนเก็บฐานข้อมูล */
export function encryptTotpSecret(secret: string, base64Key: string) {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("TOTP_KEY_INVALID");
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

/** ถอด secret เฉพาะใน memory ระหว่าง enrollment/login challenge */
export function decryptTotpSecret(payload: string, base64Key: string) {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("TOTP_KEY_INVALID");
  const [ivValue, tagValue, ciphertextValue] = payload.split(".");
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error("TOTP_PAYLOAD_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
}

/** สร้าง recovery code แบบใช้ครั้งเดียวและคืน plaintext เฉพาะ enrollment response */
export function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => randomBytes(8).toString("hex").toUpperCase());
}

/** hash recovery code ก่อนเก็บ/ค้นเพื่อไม่ให้ฐานข้อมูลใช้ bypass TOTP ได้ */
export function hashRecoveryCode(code: string) {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

/** ถอด Base32 secret โดยไม่รับอักขระนอก alphabet เพื่อกัน secret ที่ตีความไม่ตรงกัน */
function decodeBase32(value: string) {
  let bits = "";
  for (const character of value.replaceAll("=", "").toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("TOTP_SECRET_INVALID");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8)
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  return Buffer.from(bytes);
}

/** คำนวณ TOTP 6 หลักตาม RFC 6238 ด้วยช่วงเวลา 30 วินาที */
export function calculateTotp(secret: string, unixSeconds = Math.floor(Date.now() / 1000)) {
  const step = Math.floor(unixSeconds / 30);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const number = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(number).padStart(6, "0");
}

/** ตรวจ code ใน window ±1 และบังคับ step ใหม่กว่าครั้งล่าสุดเพื่อป้องกัน replay */
export function verifyTotp(secret: string, code: string, unixSeconds = Math.floor(Date.now() / 1000), lastUsedStep: number | null = null) {
  if (!/^\d{6}$/.test(code)) return { valid: false, step: null } as const;
  const currentStep = Math.floor(unixSeconds / 30);
  for (const step of [currentStep - 1, currentStep, currentStep + 1]) {
    if ((lastUsedStep === null || step > lastUsedStep) && calculateTotp(secret, step * 30) === code)
      return { valid: true, step } as const;
  }
  return { valid: false, step: null } as const;
}
