import "server-only";

import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { couponCodes, couponRedemptions, packages, promotions } from "@/db/schema";
import { calculatePromotionBenefit, isPromotionAvailable } from "@/lib/promotion-benefit";

/** ข้อผิดพลาดทางธุรกิจของคูปอง พร้อมสถานะ HTTP ที่ API นำไปใช้ได้ */
export class CouponError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** ตรวจเงื่อนไขคูปองทั้งหมดและคืนยอดคำนวณจากราคาแพ็กเกจในฐานข้อมูล */
export async function getCouponQuote({
  code,
  memberId,
  packageId,
}: {
  code: string;
  memberId: number;
  packageId: number;
}) {
  const normalizedCode = code.trim().toUpperCase();
  const [coupon] = await db
    .select({
      id: couponCodes.id,
      code: couponCodes.code,
      maxUses: couponCodes.maxUses,
      usedCount: couponCodes.usedCount,
      perMemberLimit: couponCodes.perMemberLimit,
      minPurchase: couponCodes.minPurchase,
      isActive: couponCodes.isActive,
      promotionId: promotions.id,
      promotionName: promotions.name,
      promotionType: promotions.type,
      promotionValue: promotions.value,
      promotionStartDate: promotions.startDate,
      promotionEndDate: promotions.endDate,
      promotionIsActive: promotions.isActive,
    })
    .from(couponCodes)
    .innerJoin(promotions, eq(couponCodes.promotionId, promotions.id))
    .where(eq(couponCodes.code, normalizedCode))
    .limit(1);

  if (!coupon || !coupon.isActive) throw new CouponError("ไม่พบคูปองหรือคูปองถูกปิดใช้งาน", 404);
  if (
    !isPromotionAvailable({
      type: coupon.promotionType,
      value: coupon.promotionValue,
      startDate: coupon.promotionStartDate,
      endDate: coupon.promotionEndDate,
      isActive: coupon.promotionIsActive,
    })
  ) {
    throw new CouponError("คูปองอยู่นอกช่วงเวลาที่ใช้งานได้");
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    throw new CouponError("คูปองถูกใช้ครบจำนวนแล้ว");
  }

  const [selectedPackage] = await db
    .select({ id: packages.id, price: packages.price, isActive: packages.isActive })
    .from(packages)
    .where(eq(packages.id, packageId))
    .limit(1);
  if (!selectedPackage || !selectedPackage.isActive) throw new CouponError("ไม่พบแพ็กเกจที่เลือก", 404);

  const originalAmount = Number(selectedPackage.price);
  if (originalAmount < Number(coupon.minPurchase)) {
    throw new CouponError(`คูปองนี้ใช้ได้เมื่อมียอดขั้นต่ำ ${Number(coupon.minPurchase).toLocaleString("th-TH")} บาท`);
  }

  const [memberUsage] = await db
    .select({ value: count() })
    .from(couponRedemptions)
    .where(and(eq(couponRedemptions.couponId, coupon.id), eq(couponRedemptions.memberId, memberId)));
  if (memberUsage.value >= coupon.perMemberLimit) {
    throw new CouponError("สมาชิกคนนี้ใช้คูปองครบตามสิทธิ์แล้ว");
  }

  const benefit = calculatePromotionBenefit(originalAmount, {
    type: coupon.promotionType,
    value: coupon.promotionValue,
  });

  return {
    couponId: coupon.id,
    code: coupon.code,
    promotionId: coupon.promotionId,
    promotionName: coupon.promotionName,
    originalAmount,
    ...benefit,
  };
}
