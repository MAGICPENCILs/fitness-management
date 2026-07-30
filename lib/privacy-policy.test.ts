import { describe, expect, it } from "vitest";
import {
  assertSeparateReviewer,
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
});

