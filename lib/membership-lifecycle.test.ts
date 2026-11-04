import { describe, expect, it } from "vitest";
import {
  assertFreezeAllowance,
  calculateFrozenCalendarDays,
  calculateGrantedFreezeDays,
  extendExpiryDate,
  getBangkokCalendarYear,
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

  it.each([
    ["ทันที", "2026-11-04T08:00:00.000Z", "2026-11-04T08:01:00.000Z", 0],
    ["ครบกำหนด", "2026-11-04T08:00:00.000Z", "2026-11-14T08:00:00.000Z", 10],
    ["เลยกำหนด", "2026-11-04T08:00:00.000Z", "2026-11-20T08:00:00.000Z", 16],
    ["ข้ามปี", "2026-12-28T08:00:00.000Z", "2027-01-04T08:00:00.000Z", 7],
  ])("นับวัน Freeze ตามวันปฏิทินเมื่อ Unfreeze %s", (_case, startedAt, endedAt, expected) => {
    expect(calculateFrozenCalendarDays(new Date(startedAt), new Date(endedAt))).toBe(expected);
  });

  it("นับหนึ่งวันเมื่อข้ามเที่ยงคืนตามเวลาไทย แม้ยังเป็นวัน UTC เดิม", () => {
    expect(
      calculateFrozenCalendarDays(
        new Date("2026-11-04T16:59:00.000Z"),
        new Date("2026-11-04T17:01:00.000Z"),
      ),
    ).toBe(1);
  });

  it("ให้วันชดเชยไม่เกินจำนวนวันที่อนุมัติ", () => {
    expect(
      calculateGrantedFreezeDays(
        new Date("2026-11-04T08:00:00.000Z"),
        new Date("2026-11-20T08:00:00.000Z"),
        10,
      ),
    ).toBe(10);
  });

  it("ใช้ปีปฏิทินไทยเมื่อ timestamp ข้ามปีใหม่ไทยแล้ว", () => {
    expect(getBangkokCalendarYear(new Date("2026-12-31T17:00:00.000Z"))).toBe(2027);
  });
});
