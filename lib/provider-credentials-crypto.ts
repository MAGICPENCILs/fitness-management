import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type ProviderCredentialField = "accessToken" | "channelSecret";

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const INVALID_PAYLOAD = "PROVIDER_CREDENTIAL_PAYLOAD_INVALID";

/** ตรวจ base64 แบบตรงรูป เพราะ Node อาจข้ามอักขระผิดรูปและได้ key เดิม */
function decodeKey(base64Key: string | undefined) {
  const key = Buffer.from(base64Key ?? "", "base64");
  if (key.length !== 32 || key.toString("base64") !== base64Key) {
    throw new Error("PROVIDER_CONFIG_KEY_INVALID");
  }
  return key;
}

/** บังคับ key ที่ถูกต้องแม้ singleton ที่ล้างแล้วจะไม่มี ciphertext ให้ตรวจ */
export function assertProviderConfigKey(key: string | undefined) {
  decodeKey(key);
}

/** ผูก ciphertext กับ singleton และ field เพื่อกันสลับ credentials */
function credentialAad(field: ProviderCredentialField) {
  return Buffer.from(`line_provider_settings:1:${field}:${VERSION}`);
}

/** รับเฉพาะรูปแบบที่เขียนลง DB เพื่อไม่ให้ตัวถอดรหัสยอมรับ envelope ผิดรูป */
function decodePart(encoded: string) {
  const bytes = Buffer.from(encoded, "base64url");
  if (bytes.toString("base64url") !== encoded) throw new Error(INVALID_PAYLOAD);
  return bytes;
}

/** ใช้ IV ใหม่ทุกครั้งเพื่อให้บันทึก credential เดิมแล้วได้ ciphertext ต่างกัน */
export function encryptProviderCredential(
  value: string,
  field: ProviderCredentialField,
  base64Key: string | undefined,
): string {
  const key = decodeKey(base64Key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(credentialAad(field));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);

  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

/** คืน plaintext หลังตรวจ tag สำเร็จเท่านั้น และซ่อนรายละเอียด error ของ crypto */
export function decryptProviderCredential(
  payload: string,
  field: ProviderCredentialField,
  base64Key: string | undefined,
): string {
  const key = decodeKey(base64Key);
  const [version, ivValue, tagValue, ciphertextValue, extra] = payload.split(".");
  if (version !== VERSION || !ivValue || !tagValue || ciphertextValue === undefined || extra !== undefined) {
    throw new Error(INVALID_PAYLOAD);
  }
  const iv = decodePart(ivValue);
  const tag = decodePart(tagValue);
  const ciphertext = decodePart(ciphertextValue);
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error(INVALID_PAYLOAD);

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(credentialAad(field));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error(INVALID_PAYLOAD);
  }
}
