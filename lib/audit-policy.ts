const ALLOWED_KEYS = new Set([
  "entityId",
  "memberId",
  "branchId",
  "fields",
  "status",
  "result",
  "count",
  "method",
  "module",
  "errorCode",
  "source",
  "rotated",
  "scope",
]);

const PROHIBITED_PII_KEYS = new Set([
  "firstName",
  "lastName",
  "phone",
  "email",
  "idCard",
  "address",
  "recipient",
  "message",
  "note",
]);

const ALLOWED_FIELD_NAMES = new Set([
  "firstName",
  "lastName",
  "phone",
  "email",
  "idCard",
  "address",
  "photo",
  "memberCode",
  "recipient",
  "message",
  "note",
  "reason",
  "reviewNote",
  "cardNumber",
  "qrCode",
  "accessSerial",
  "healthCondition",
  "goal",
  "trainerNote",
  "paymentNote",
  "packageNote",
  "lockerNote",
  "staffCode",
  "homeBranchId",
  "role",
  "status",
  "currentUsageHours",
  "weightKg",
  "bmi",
  "waistCm",
  "workoutSummary",
  "birthDate",
  "gender",
  "photoUrl",
]);

const ENUM_LIKE_VALUE = /^[A-Z0-9_.-]+$/;
const SHA256_FINGERPRINT = /^[a-f0-9]{64}$/i;
const READ_ALLOWED_KEYS = new Set([
  ...ALLOWED_KEYS,
  "reasonCode",
  "ipFingerprint",
  "userAgentCategory",
]);

/** ย่อเฉพาะ SHA-256/HMAC fingerprint ที่มีรูปแบบถูกต้อง เพื่อไม่ส่งค่าเต็มหรือข้อมูลดิบจาก row ที่ผิดรูป */
export function truncateAuthFingerprint(value: unknown): string | null {
  return typeof value === "string" && SHA256_FINGERPRINT.test(value)
    ? value.slice(0, 12)
    : null;
}

/** กรอง metadata ตอนอ่านซ้ำ เพราะ auth audit บางรายการเขียนตรงและอาจมี fingerprint เต็มใน storage */
export function sanitizeAuditMetadataForRead(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value) return null;
  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!READ_ALLOWED_KEYS.has(key)) continue;
    if (key === "ipFingerprint") {
      const fingerprint = truncateAuthFingerprint(item);
      if (fingerprint) sanitized[key] = fingerprint;
      continue;
    }
    if (
      item === null ||
      typeof item === "number" ||
      typeof item === "boolean"
    ) {
      sanitized[key] = item;
      continue;
    }
    if (typeof item === "string" && ENUM_LIKE_VALUE.test(item)) {
      sanitized[key] = item;
      continue;
    }
    if (
      key === "fields" &&
      Array.isArray(item) &&
      item.every(
        (field): field is string =>
          typeof field === "string" && ALLOWED_FIELD_NAMES.has(field),
      )
    ) {
      sanitized[key] = [...item];
    }
  }
  return Object.keys(sanitized).length ? sanitized : null;
}

/** ตรวจและคัดลอก audit metadata ด้วย allowlist เพื่อไม่ให้ PII หลุดเข้า log */
export function sanitizeAuditMetadata(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;

  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (PROHIBITED_PII_KEYS.has(key))
      throw new Error(`PII key ${key} is prohibited in audit metadata`);
    if (!ALLOWED_KEYS.has(key))
      throw new Error(`audit metadata key ${key} is not allowed`);

    if (
      item === null ||
      typeof item === "number" ||
      typeof item === "boolean"
    ) {
      sanitized[key] = item;
      continue;
    }
    if (typeof item === "string" && ENUM_LIKE_VALUE.test(item)) {
      sanitized[key] = item;
      continue;
    }
    if (
      key === "fields" &&
      Array.isArray(item) &&
      item.every(
        (field): field is string =>
          typeof field === "string" && ALLOWED_FIELD_NAMES.has(field),
      )
    ) {
      sanitized[key] = [...item];
      continue;
    }
    throw new Error(`audit metadata value for ${key} is not allowed`);
  }
  return sanitized;
}
