import { describe, expect, it } from "vitest";
import { evaluateAccessPolicy } from "@/lib/access-policy";

describe("access policy", () => {
  const now = new Date("2026-11-03T08:00:00+07:00");

  it("อนุมัติสมาชิก active ที่มีแพ็กเกจครอบคลุมวันนี้", () => {
    expect(
      evaluateAccessPolicy({
        memberStatus: "ACTIVE",
        packageStatus: "ACTIVE",
        startDate: "2026-11-01",
        expireDate: "2026-11-11",
        now,
      }),
    ).toEqual({ approved: true, daysLeft: 8, warning: null });
  });

  it("เตือนเมื่อเหลือไม่เกิน 7 วันโดยไม่ปฏิเสธ", () => {
    expect(
      evaluateAccessPolicy({
        memberStatus: "ACTIVE",
        packageStatus: "ACTIVE",
        startDate: "2026-11-01",
        expireDate: "2026-11-09",
        now,
      }),
    ).toEqual({ approved: true, daysLeft: 6, warning: "เหลืออีก 6 วัน" });
  });

  it.each([
    ["FROZEN", "สมาชิกถูกระงับการเข้าใช้ชั่วคราว"],
    ["SUSPENDED", "สมาชิกถูกระงับ"],
    ["CANCELLED", "สมาชิกถูกยกเลิก"],
  ] as const)("ปฏิเสธสถานะสมาชิก %s", (memberStatus, reason) => {
    expect(
      evaluateAccessPolicy({
        memberStatus,
        packageStatus: "ACTIVE",
        startDate: "2026-11-01",
        expireDate: "2026-11-10",
        now,
      }),
    ).toEqual({ approved: false, reason });
  });

  it("ปฏิเสธแพ็กเกจที่ยังไม่เริ่มหรือหมดอายุ", () => {
    expect(
      evaluateAccessPolicy({
        memberStatus: "ACTIVE",
        packageStatus: "ACTIVE",
        startDate: "2026-11-04",
        expireDate: "2026-11-10",
        now,
      }),
    ).toEqual({ approved: false, reason: "แพ็กเกจยังไม่เริ่มใช้งาน" });
    expect(
      evaluateAccessPolicy({
        memberStatus: "ACTIVE",
        packageStatus: "ACTIVE",
        startDate: "2026-10-01",
        expireDate: "2026-11-02",
        now,
      }),
    ).toEqual({ approved: false, reason: "แพ็กเกจหมดอายุ" });
  });

  it.each([
    ["2026-11-02", -1, "อยู่ในช่วงผ่อนผันอีก 2 วัน"],
    ["2026-10-31", -3, "วันสุดท้ายของช่วงผ่อนผัน"],
  ] as const)("อนุมัติหลังหมดอายุภายใน grace 3 วันสำหรับวันหมดอายุ %s", (expireDate, daysLeft, warning) => {
    expect(evaluateAccessPolicy({
      memberStatus: "ACTIVE",
      packageStatus: "ACTIVE",
      startDate: "2026-10-01",
      expireDate,
      graceDays: 3,
      now,
    })).toEqual({ approved: true, daysLeft, warning });
  });

  it("ปฏิเสธเมื่อเลย grace period", () => {
    expect(evaluateAccessPolicy({
      memberStatus: "ACTIVE",
      packageStatus: "ACTIVE",
      startDate: "2026-10-01",
      expireDate: "2026-10-30",
      graceDays: 3,
      now,
    })).toEqual({ approved: false, reason: "แพ็กเกจหมดอายุเกินช่วงผ่อนผัน" });
  });
});
