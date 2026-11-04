export class MembershipLifecycleError extends Error {
  /** ใช้รหัสคงที่ให้ route แปลงข้อความโดยไม่ผูก service กับ UI */
  constructor(public code: string) {
    super(code);
    this.name = "MembershipLifecycleError";
  }
}

/** ตรวจโควตา Freeze สูงสุด 30 วันต่อสมาชิกต่อปี รวมรายการที่ใช้ไปแล้ว */
export function assertFreezeAllowance(daysUsedThisYear: number, requestedDays: number) {
  if (!Number.isInteger(requestedDays) || requestedDays < 1 || requestedDays > 30)
    throw new MembershipLifecycleError("FREEZE_DAYS_INVALID");
  if (daysUsedThisYear + requestedDays > 30)
    throw new MembershipLifecycleError("FREEZE_LIMIT_EXCEEDED");
}

/** ต่อวันหมดอายุแบบ UTC date-only เพื่อไม่ให้ DST หรือ timezone ของ server เปลี่ยนจำนวนวัน */
export function extendExpiryDate(expireDate: string | Date, days: number) {
  const key =
    typeof expireDate === "string"
      ? expireDate.slice(0, 10)
      : expireDate.toISOString().slice(0, 10);
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** นับจำนวนวันปฏิทินไทยที่ผ่านจริง เพื่อให้เส้นแบ่งวันตรงกับเวลาที่สาขาใช้งาน */
export function calculateFrozenCalendarDays(startedAt: Date, endedAt: Date) {
  const toBangkokDate = (date: Date) => {
    const bangkok = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    return Date.UTC(bangkok.getUTCFullYear(), bangkok.getUTCMonth(), bangkok.getUTCDate());
  };
  const startDate = toBangkokDate(startedAt);
  const endDate = toBangkokDate(endedAt);
  return Math.max(0, Math.floor((endDate - startDate) / 86_400_000));
}

/** ให้วันชดเชยตามวันที่ Freeze จริง แต่ไม่เกินจำนวนวันที่ได้รับอนุมัติ */
export function calculateGrantedFreezeDays(startedAt: Date, endedAt: Date, requestedDays: number) {
  return Math.min(calculateFrozenCalendarDays(startedAt, endedAt), requestedDays);
}

/** คืนปีปฏิทินไทยจาก timestamp เพื่อให้โควตาปีใหม่ตรงกับเวลาที่สาขาใช้งาน */
export function getBangkokCalendarYear(at: Date) {
  return new Date(at.getTime() + 7 * 60 * 60 * 1000).getUTCFullYear();
}
