export type PromotionBenefit = {
  discountAmount: number;
  bonusDays: number;
  finalAmount: number;
};

type PromotionLike = {
  type: "DISCOUNT_AMOUNT" | "DISCOUNT_PERCENT" | "BONUS_DAYS";
  value: string | number;
  startDate: string | Date;
  endDate: string | Date;
  isActive?: boolean | null;
};

/** แปลงวันที่โปรโมชันเป็นเวลาท้องถิ่น และรองรับการนับวันสิ้นสุดแบบเต็มวัน */
function toDate(value: string | Date, endOfDay = false) {
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T00:00:00`);
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}

/** ตรวจว่าโปรโมชันเปิดใช้งานและอยู่ในช่วงวันที่ที่กำหนด */
export function isPromotionAvailable(promotion: PromotionLike, now = new Date()) {
  return (
    promotion.isActive !== false &&
    now >= toDate(promotion.startDate) &&
    now <= toDate(promotion.endDate, true)
  );
}

/** คำนวณส่วนลด วันโบนัส และยอดสุทธิ โดยไม่ให้ยอดติดลบ */
export function calculatePromotionBenefit(
  originalAmount: number,
  promotion?: Pick<PromotionLike, "type" | "value"> | null,
): PromotionBenefit {
  if (!promotion) {
    return { discountAmount: 0, bonusDays: 0, finalAmount: originalAmount };
  }

  const value = Math.max(0, Number(promotion.value));
  const rawDiscount =
    promotion.type === "DISCOUNT_AMOUNT"
      ? value
      : promotion.type === "DISCOUNT_PERCENT"
        ? originalAmount * Math.min(value, 100) / 100
        : 0;
  const discountAmount = Math.min(originalAmount, Math.round(rawDiscount * 100) / 100);
  const bonusDays = promotion.type === "BONUS_DAYS" ? Math.floor(value) : 0;

  return {
    discountAmount,
    bonusDays,
    finalAmount: Math.max(0, Math.round((originalAmount - discountAmount) * 100) / 100),
  };
}
