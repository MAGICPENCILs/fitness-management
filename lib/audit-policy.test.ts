import { describe, expect, it } from "vitest";
import {
  sanitizeAuditMetadata,
  sanitizeAuditMetadataForRead,
} from "@/lib/audit-policy";

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

  it("อนุญาตเฉพาะชื่อฟิลด์อุปกรณ์และสถานะบำรุงแบบ enum-like", () => {
    const fields = [
      "code",
      "name",
      "category",
      "location",
      "serialNumber",
      "purchaseDate",
      "warrantyEndDate",
      "maintenanceIntervalHours",
      "nextMaintenanceDate",
      "note",
      "currentUsageHours",
      "status",
      "retiredAt",
      "retiredReason",
    ];
    expect(
      sanitizeAuditMetadata({
        fields,
        maintenanceType: "PREVENTIVE",
        maintenanceStatus: "COMPLETED",
      }),
    ).toEqual({
      fields,
      maintenanceType: "PREVENTIVE",
      maintenanceStatus: "COMPLETED",
    });
  });

  it.each([
    ["reason", "ชำรุดถาวร"],
    ["note", "ข้อมูลการซ่อม"],
    ["serialNumber", "SN-SECRET-001"],
    ["cost", 1200],
    ["token", "SECRET_TOKEN"],
    ["hash", "a".repeat(64)],
    ["ip", "203.0.113.10"],
    ["ipAddress", "203.0.113.10"],
    ["rawIp", "203.0.113.10"],
    ["userAgent", "Mozilla/5.0"],
    ["fullUserAgent", "Mozilla/5.0"],
  ])("ปฏิเสธรายละเอียดอ่อนไหว key %s", (key, value) => {
    expect(() => sanitizeAuditMetadata({ [key]: value })).toThrow();
  });

  it.each(["ชำรุดถาวร", "SN-SECRET-001", "บันทึกข้อความอิสระ"])(
    "ปฏิเสธ free-text แม้ใช้ key สถานะบำรุงที่อนุญาต: %s",
    (value) => {
      expect(() =>
        sanitizeAuditMetadata({ maintenanceStatus: value }),
      ).toThrow("metadata");
    },
  );

  it("ไม่คืนค่า maintenance enum ที่ผิด allowlist จากข้อมูลเก่า", () => {
    expect(
      sanitizeAuditMetadataForRead({
        maintenanceType: "SN-SECRET-001",
        maintenanceStatus: "ข้อความอิสระ",
      }),
    ).toBeNull();
  });
});
