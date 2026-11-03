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
