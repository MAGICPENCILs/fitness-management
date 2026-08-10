import { describe, expect, it } from "vitest";
import {
  assertSeparateReviewer,
  buildAnonymizationValues,
  canRetryPrivacyCleanup,
  canTransitionRequest,
} from "@/lib/privacy-policy";

describe("privacy request policy", () => {
  it("อนุญาต PENDING ไป APPROVED หรือ REJECTED เท่านั้น", () => {
    expect(canTransitionRequest("PENDING", "APPROVED")).toBe(true);
    expect(canTransitionRequest("PENDING", "REJECTED")).toBe(true);
    expect(canTransitionRequest("PENDING", "COMPLETED")).toBe(false);
  });

  it("อนุญาต APPROVED ไป COMPLETED เท่านั้นและ terminal state เปลี่ยนไม่ได้", () => {
    expect(canTransitionRequest("APPROVED", "COMPLETED")).toBe(true);
    expect(canTransitionRequest("APPROVED", "REJECTED")).toBe(false);
    expect(canTransitionRequest("COMPLETED", "APPROVED")).toBe(false);
    expect(canTransitionRequest("REJECTED", "PENDING")).toBe(false);
  });

  it("ห้ามผู้สร้างอนุมัติคำขอของตน", () => {
    expect(() => assertSeparateReviewer(7, 7)).toThrow("คนละคน");
  });

  it("อนุญาตผู้อนุมัติคนอื่น", () => {
    expect(() => assertSeparateReviewer(7, 8)).not.toThrow();
  });

  it("สร้างค่านิรนามโดยไม่เก็บรหัสสมาชิกเดิมและล้าง PII ทุกช่อง", () => {
    expect(buildAnonymizationValues(42, "A1B2C3")).toEqual({
      memberCode: "ANON-42-A1B2C3",
      firstName: "ข้อมูลถูกลบ",
      lastName: "ANON-42-A1B2C3",
      idCard: null,
      phone: null,
      email: null,
      birthDate: null,
      gender: null,
      address: null,
      photoUrl: null,
      status: "CANCELLED",
      note: null,
    });
  });

  it("จำกัดรหัสนิรนามไม่ให้เกินความยาวคอลัมน์ member_code", () => {
    expect(buildAnonymizationValues(2_147_483_647, "A1B2C3D4E5F6").memberCode)
      .toHaveLength(20);
  });

  it("ให้ retry cleanup เฉพาะคำขอที่อนุมัติและไม่มี restore failure", () => {
    expect(canRetryPrivacyCleanup("APPROVED", "PENDING", null)).toBe(true);
    expect(canRetryPrivacyCleanup("APPROVED", "FAILED", "FILE_DELETE_FAILED")).toBe(true);
    expect(canRetryPrivacyCleanup("COMPLETED", "FAILED", null)).toBe(false);
    expect(canRetryPrivacyCleanup("APPROVED", "NOT_REQUIRED", null)).toBe(false);
    expect(canRetryPrivacyCleanup("APPROVED", "FAILED", "FILE_RESTORE_FAILED")).toBe(false);
  });
});
