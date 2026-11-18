import { throws } from "node:assert/strict";
import { describe, expect, it } from "vitest";
import {
  decryptProviderCredential,
  encryptProviderCredential,
} from "@/lib/provider-credentials-crypto";

const KEY = Buffer.alloc(32, 1).toString("base64");
const FIXTURE = "v1.AAAAAAAAAAAAAAAA.dSkbYni4IbDOOhwEj3LJig.2VzgqABJZpLgHPE3FFA";
const FIELD = "channelSecret";

/** กัน error ที่มีรหัสถูกแต่พ่วงข้อมูลลับไว้ในข้อความหรือ cause */
function expectFixedError(action: () => unknown, message: string) {
  throws(action, (error: unknown) => {
    expect(error).toHaveProperty("message", message);
    expect(error).not.toHaveProperty("cause");
    return true;
  });
}

describe("provider credential encryption", () => {
  it("ตรวจ key ได้แม้ไม่มี ciphertext เหลือหลัง clear", async () => {
    const crypto = await import("@/lib/provider-credentials-crypto");
    expect(crypto.assertProviderConfigKey).toBeTypeOf("function");
    expect(crypto.assertProviderConfigKey(KEY)).toBeUndefined();
    expectFixedError(() => crypto.assertProviderConfigKey(undefined), "PROVIDER_CONFIG_KEY_INVALID");
  });
  it("ถอด v1 envelope ที่ผูก AAD กับ field ของ singleton ได้", () => {
    expect(decryptProviderCredential(FIXTURE, FIELD, KEY)).toBe("fixture-secret");
  });

  it("เก็บเฉพาะ ciphertext ที่ถอดกลับได้โดยใช้ IV ใหม่ทุกครั้ง", () => {
    const value = "synthetic-line-secret";
    const payload = encryptProviderCredential(value, FIELD, KEY);

    expect(payload).toMatch(/^v1\.[\w-]{16}\.[\w-]{22}\.[\w-]+$/);
    expect(payload).not.toContain(value);
    expect(payload.split(".")[1]).not.toBe(
      encryptProviderCredential(value, FIELD, KEY).split(".")[1],
    );
    expect(decryptProviderCredential(payload, FIELD, KEY)).toBe(value);
  });

  it.each([
    ["missing", undefined],
    ["short", Buffer.alloc(31).toString("base64")],
    ["long", Buffer.alloc(33).toString("base64")],
    ["malformed", `!${KEY}`],
  ] as const)("ปฏิเสธ master key แบบ %s", (_label, key) => {
    expectFixedError(() => encryptProviderCredential("fake", FIELD, key), "PROVIDER_CONFIG_KEY_INVALID");
    expectFixedError(() => decryptProviderCredential(FIXTURE, FIELD, key), "PROVIDER_CONFIG_KEY_INVALID");
  });

  it("ไม่ถอดด้วย master key คนละค่า", () => {
    expectFixedError(
      () => decryptProviderCredential(FIXTURE, FIELD, Buffer.alloc(32, 2).toString("base64")),
      "PROVIDER_CREDENTIAL_PAYLOAD_INVALID",
    );
  });

  it("ไม่ยอมให้สลับ ciphertext ระหว่าง fields", () => {
    expectFixedError(() => decryptProviderCredential(FIXTURE, "accessToken", KEY), "PROVIDER_CREDENTIAL_PAYLOAD_INVALID");
  });

  it("ปฏิเสธ ciphertext ที่ถูกเปลี่ยนโดยไม่คืน plaintext หรือ raw error", () => {
    const tampered = FIXTURE.replace("2Vzg", "3Vzg");
    expectFixedError(() => decryptProviderCredential(tampered, FIELD, KEY), "PROVIDER_CREDENTIAL_PAYLOAD_INVALID");
  });

  it.each([
    ["version", FIXTURE.replace("v1", "v2")],
    ["trailing segment", `${FIXTURE}.extra`],
    ["short IV", FIXTURE.replace("AAAAAAAAAAAAAAAA", "AAAA")],
    ["short tag", FIXTURE.replace("dSkbYni4IbDOOhwEj3LJig", "dSkbYg")],
    ["non-base64url", FIXTURE.replace("2Vzg", "!2Vzg")],
    ["missing ciphertext", FIXTURE.slice(0, FIXTURE.lastIndexOf(".") + 1)],
  ])("ปฏิเสธ envelope ผิดรูปแบบ: %s", (_label, payload) => {
    expectFixedError(() => decryptProviderCredential(payload, FIELD, KEY), "PROVIDER_CREDENTIAL_PAYLOAD_INVALID");
  });
});
