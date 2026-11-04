import { describe, expect, it } from "vitest";
import { assertPayrollPeriod, calculateCommissionSatang, calculatePayrollAmounts, payrollPeriodsOverlap, nextAttendancePunch } from "@/lib/workforce-policy";

describe("workforce policy", () => {
  it("ปฏิเสธช่วง payroll ที่เรียงผิดหรือไม่มีจริงในปฏิทิน", () => {
    expect(() => assertPayrollPeriod("2026-11-01", "2026-11-30")).not.toThrow();
    expect(() => assertPayrollPeriod("2026-11-30", "2026-11-01")).toThrowError("PAYROLL_PERIOD_INVALID");
    expect(() => assertPayrollPeriod("2026-02-30", "2026-03-01")).toThrowError("PAYROLL_PERIOD_INVALID");
  });

  it("ถือว่าช่วง payroll ที่คร่อมหรือแตะวันเดียวกันซ้อนทับกัน", () => {
    expect(payrollPeriodsOverlap("2026-11-01", "2026-11-15", "2026-11-15", "2026-11-30")).toBe(true);
    expect(payrollPeriodsOverlap("2026-11-01", "2026-11-14", "2026-11-15", "2026-11-30")).toBe(false);
  });

  it("คำนวณ commission ด้วย basis points และปัดเป็นสตางค์", () => {
    expect(calculateCommissionSatang(100_099, 250)).toBe(2_502);
  });

  it("สลับ punch IN/OUT และไม่สร้างสถานะอื่น", () => {
    expect(nextAttendancePunch(null)).toBe("IN");
    expect(nextAttendancePunch("IN")).toBe("OUT");
    expect(nextAttendancePunch("OUT")).toBe("IN");
  });

  it("รวม payroll ด้วยสตางค์โดยไม่ใช้ floating point", () => {
    expect(calculatePayrollAmounts("0.10", "0.20")).toEqual({
      commissionAmount: "0.20",
      totalAmount: "0.30",
    });
  });
});
