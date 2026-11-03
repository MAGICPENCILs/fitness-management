import { describe, expect, it } from "vitest";
import {
  assertFreezeAllowance,
  extendExpiryDate,
} from "@/lib/membership-lifecycle";

describe("freeze policy", () => {
  it("อนุญาตเมื่อยอดรวมปีเดียวกันไม่เกิน 30 วัน", () => {
    expect(() => assertFreezeAllowance(20, 10)).not.toThrow();
    expect(() => assertFreezeAllowance(20, 11)).toThrowError("FREEZE_LIMIT_EXCEEDED");
  });

  it("ปฏิเสธจำนวนวันที่ไม่ใช่ 1-30", () => {
    expect(() => assertFreezeAllowance(0, 0)).toThrowError("FREEZE_DAYS_INVALID");
    expect(() => assertFreezeAllowance(0, 31)).toThrowError("FREEZE_DAYS_INVALID");
  });

  it("ต่อวันหมดอายุด้วย date-only arithmetic โดยไม่คลาด timezone", () => {
    expect(extendExpiryDate("2026-12-28", 7)).toBe("2027-01-04");
  });
});
