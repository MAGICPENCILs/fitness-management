import { describe, expect, it } from "vitest";
import { sanitizeAuditMetadata } from "@/lib/audit-policy";

describe("audit metadata policy", () => {
  it("เก็บเฉพาะ id ชื่อฟิลด์และสถานะ", () => {
    expect(
      sanitizeAuditMetadata({
        entityId: 8,
        fields: ["phone", "email"],
        status: "COMPLETED",
      }),
    ).toEqual({
      entityId: 8,
      fields: ["phone", "email"],
      status: "COMPLETED",
    });
  });

  it.each([
    "firstName",
    "lastName",
    "phone",
    "email",
    "idCard",
    "address",
    "recipient",
    "message",
    "note",
  ])("ปฏิเสธ prohibited key %s", (key) => {
    expect(() => sanitizeAuditMetadata({ [key]: "secret" })).toThrow("PII");
  });

  it("ปฏิเสธข้อความอิสระแม้อยู่ใน key ที่อนุญาต", () => {
    expect(() => sanitizeAuditMetadata({ status: "มีข้อมูลลับ" })).toThrow(
      "metadata",
    );
  });

  it("อนุญาต metadata แบบ enum-like สำหรับคำสั่ง security", () => {
    expect(
      sanitizeAuditMetadata({
        source: "SECURITY_ADMIN",
        scope: "ACCOUNT",
        count: 2,
      }),
    ).toEqual({ source: "SECURITY_ADMIN", scope: "ACCOUNT", count: 2 });
  });
});
