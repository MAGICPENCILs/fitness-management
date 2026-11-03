import { describe, expect, it } from "vitest";
import { calculateTotp, decryptTotpSecret, encryptTotpSecret, generateRecoveryCodes, hashRecoveryCode, verifyTotp } from "@/lib/totp";

describe("staff TOTP", () => {
  const secret = "JBSWY3DPEHPK3PXP";

  it("สร้าง code 6 หลักแบบ deterministic ตาม time step", () => {
    expect(calculateTotp(secret, 2_000_000_000)).toMatch(/^\d{6}$/);
    expect(calculateTotp(secret, 2_000_000_000)).toBe(calculateTotp(secret, 2_000_000_005));
  });

  it("ยอมรับ window ±1 แต่ปฏิเสธ step ที่เคยใช้แล้ว", () => {
    const nowSeconds = 2_000_000_000;
    const code = calculateTotp(secret, nowSeconds - 30);
    const result = verifyTotp(secret, code, nowSeconds, null);
    expect(result.valid).toBe(true);
    expect(verifyTotp(secret, code, nowSeconds, result.step)).toEqual({ valid: false, step: null });
  });

  it("เข้ารหัส secret และเก็บ recovery codes เฉพาะ hash", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const encrypted = encryptTotpSecret(secret, key);
    expect(encrypted).not.toContain(secret);
    expect(decryptTotpSecret(encrypted, key)).toBe(secret);
    const codes = generateRecoveryCodes(3);
    expect(codes).toHaveLength(3);
    expect(hashRecoveryCode(codes[0])).toMatch(/^[a-f0-9]{64}$/);
    expect(hashRecoveryCode(codes[0])).not.toBe(codes[0]);
  });
});
