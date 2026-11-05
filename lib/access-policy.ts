type MemberStatus =
  | "ACTIVE"
  | "EXPIRED"
  | "FROZEN"
  | "SUSPENDED"
  | "CANCELLED";

type PackageStatus = "ACTIVE" | "EXPIRED" | "FROZEN" | "CANCELLED";

type AccessPolicyInput = {
  memberStatus: MemberStatus;
  packageStatus: PackageStatus | null;
  startDate: string | Date | null;
  expireDate: string | Date | null;
  now?: Date;
};

export type AccessPolicyResult =
  | { approved: false; reason: string }
  | { approved: true; daysLeft: number; warning: string | null };

/** แปลงวันที่เป็น YYYY-MM-DD ตามเวลาประเทศไทยเพื่อไม่ให้สิทธิ์คลาดหนึ่งวันเมื่อ server ใช้ UTC */
function thaiDateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

/** แปลง Date จากฐานข้อมูลเป็น date key โดย date-only string จะไม่ผ่าน timezone conversion ซ้ำ */
function storedDateKey(value: string | Date) {
  return typeof value === "string" ? value.slice(0, 10) : thaiDateKey(value);
}

/** ประเมินกฎเข้าใช้บริการจาก snapshot ที่ service โหลดมา โดยไม่แตะฐานข้อมูลหรือ hardware */
export function evaluateAccessPolicy(input: AccessPolicyInput): AccessPolicyResult {
  if (input.memberStatus === "FROZEN")
    return { approved: false, reason: "สมาชิกถูกระงับการเข้าใช้ชั่วคราว" };
  if (input.memberStatus === "SUSPENDED")
    return { approved: false, reason: "สมาชิกถูกระงับ" };
  if (input.memberStatus === "CANCELLED")
    return { approved: false, reason: "สมาชิกถูกยกเลิก" };
  if (input.memberStatus !== "ACTIVE")
    return { approved: false, reason: "สมาชิกไม่อยู่ในสถานะใช้งาน" };
  if (
    input.packageStatus !== "ACTIVE" ||
    !input.startDate ||
    !input.expireDate
  ) {
    return { approved: false, reason: "ไม่มีแพ็กเกจที่ใช้งานได้" };
  }

  const today = thaiDateKey(input.now ?? new Date());
  const startDate = storedDateKey(input.startDate);
  const expireDate = storedDateKey(input.expireDate);
  if (today < startDate)
    return { approved: false, reason: "แพ็กเกจยังไม่เริ่มใช้งาน" };
  if (today > expireDate)
    return { approved: false, reason: "แพ็กเกจหมดอายุ" };

  const daysLeft = Math.round(
    (Date.parse(`${expireDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
  return {
    approved: true,
    daysLeft,
    warning: daysLeft <= 7 ? `เหลืออีก ${daysLeft} วัน` : null,
  };
}
