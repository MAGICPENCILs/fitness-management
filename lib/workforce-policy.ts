const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** ตรวจช่วง payroll แบบ date-only เพื่อไม่รับวันที่ไม่มีจริงหรือช่วงย้อนกลับ */
export function assertPayrollPeriod(periodStart: string, periodEnd: string) {
  const valid = (value: string) => {
    const match = DATE_ONLY.exec(value);
    if (!match) return false;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.toISOString().slice(0, 10) === value;
  };
  if (!valid(periodStart) || !valid(periodEnd) || periodStart > periodEnd) throw new Error("PAYROLL_PERIOD_INVALID");
}

/** ช่วง payroll รวมวันต้นและวันท้าย จึงถือว่าการแตะวันเดียวกันเป็นการซ้อนทับ */
export function payrollPeriodsOverlap(firstStart: string, firstEnd: string, secondStart: string, secondEnd: string) {
  return firstStart <= secondEnd && firstEnd >= secondStart;
}

/** คำนวณ commission จากยอดสตางค์และ basis points ด้วย integer arithmetic */
export function calculateCommissionSatang(salesSatang: number, rateBasisPoints: number) {
  if (!Number.isSafeInteger(salesSatang) || salesSatang < 0 || !Number.isInteger(rateBasisPoints) || rateBasisPoints < 0 || rateBasisPoints > 10_000)
    throw new Error("COMMISSION_INPUT_INVALID");
  return Math.round((salesSatang * rateBasisPoints) / 10_000);
}

/** รวมยอด payroll ด้วย integer satang เพื่อไม่ให้ floating point เปลี่ยนยอดเงินจริง */
export function calculatePayrollAmounts(baseSalary: string, commissionAmount: string) {
  const toSatang = (value: string) => {
    const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(value);
    if (!match) throw new Error("PAYROLL_AMOUNT_INVALID");
    return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  };
  const format = (satang: number) => `${Math.floor(satang / 100)}.${String(satang % 100).padStart(2, "0")}`;
  const commissionSatang = toSatang(commissionAmount);
  return { commissionAmount: format(commissionSatang), totalAmount: format(toSatang(baseSalary) + commissionSatang) };
}

/** กำหนด punch ถัดไปจากรายการล่าสุดเพื่อให้ ledger สลับ IN/OUT เท่านั้น */
export function nextAttendancePunch(last: "IN" | "OUT" | null): "IN" | "OUT" {
  return last === "IN" ? "OUT" : "IN";
}
