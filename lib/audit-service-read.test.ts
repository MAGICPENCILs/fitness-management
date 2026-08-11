import { describe, expect, it } from "vitest";

import {
  mapAuditDashboardRow,
  resolveAuditBranchScope,
} from "@/lib/audit-service";
import { sanitizeAuditMetadataForRead } from "@/lib/audit-policy";

describe("audit reader redaction", () => {
  it("ให้ Owner อ่าน null/global rows แต่บังคับ Manager อยู่สาขาหลักเสมอ", () => {
    expect(resolveAuditBranchScope(
      { staffId: 1, role: "OWNER", homeBranchId: 1 },
      undefined,
    )).toBeUndefined();
    expect(resolveAuditBranchScope(
      { staffId: 2, role: "MANAGER", homeBranchId: 2 },
      undefined,
    )).toBe(2);
    expect(resolveAuditBranchScope(
      { staffId: 2, role: "MANAGER", homeBranchId: 2 },
      1,
    )).toBe(2);
  });
  it("ย่อ SHA-256 fingerprint และคงเฉพาะ metadata ที่ผ่าน allowlist", () => {
    expect(
      sanitizeAuditMetadataForRead({
        reasonCode: "INVALID_CREDENTIALS",
        ipFingerprint: "a".repeat(64),
        userAgentCategory: "MOBILE",
        source: "SECURITY_ADMIN",
        scope: "ACCOUNT",
        count: 2,
        unsafe: "staff@example.com",
      }),
    ).toEqual({
      reasonCode: "INVALID_CREDENTIALS",
      ipFingerprint: "aaaaaaaaaaaa",
      userAgentCategory: "MOBILE",
      source: "SECURITY_ADMIN",
      scope: "ACCOUNT",
      count: 2,
    });
  });

  it("unknown login row ที่ actor/branch เป็น null ยังแสดงได้โดยไม่คืน fingerprint เต็ม", () => {
    const row = mapAuditDashboardRow({
      id: 31,
      branchId: null,
      branchName: null,
      actorStaffId: null,
      actorFirstName: null,
      actorLastName: null,
      action: "LOGIN_FAILED",
      entityType: "AUTH_LOGIN",
      entityId: null,
      result: "FAILED",
      metadata: {
        reasonCode: "INVALID_CREDENTIALS",
        ipFingerprint: "b".repeat(64),
      },
      createdAt: new Date("2026-08-10T11:58:00.000Z"),
    });

    expect(row).toMatchObject({
      branchId: null,
      branchName: "ไม่ทราบสาขา",
      actorStaffId: null,
      actorName: "ไม่ทราบบัญชี",
      metadata: {
        reasonCode: "INVALID_CREDENTIALS",
        ipFingerprint: "bbbbbbbbbbbb",
      },
    });
    expect(JSON.stringify(row)).not.toContain("b".repeat(64));
  });
});
