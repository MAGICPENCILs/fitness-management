import { describe, expect, it } from "vitest";
import { calculateCommissionSatang, calculatePayrollAmounts, nextAttendancePunch } from "@/lib/workforce-policy";

describe("workforce policy", () => {
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
