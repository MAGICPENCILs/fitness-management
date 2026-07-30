import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  couponCodes,
  couponRedemptions,
  memberPackages,
  members,
  NewPayment,
  packages,
  payments,
  promotions,
} from "@/db/schema";
import { CouponError, getCouponQuote } from "@/lib/coupon-service";
import { calculatePromotionBenefit, isPromotionAvailable } from "@/lib/promotion-benefit";
import { getCurrentBranchId } from "@/lib/branch-service";

const paymentSchema = z
  .object({
    memberId: z.number().int().positive(),
    packageId: z.number().int().positive(),
    method: z.enum(["CASH", "QR_PROMPTPAY", "TRANSFER", "CREDIT_CARD"]),
    note: z.string().trim().max(500).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    promotionId: z.number().int().positive().optional(),
    couponCode: z.string().trim().min(3).max(32).optional(),
  })
  .refine((value) => !(value.promotionId && value.couponCode), {
    message: "เลือกใช้โปรโมชันหรือคูปองได้อย่างใดอย่างหนึ่ง",
  });

/** โหลดประวัติการชำระเงินทั้งหมดสำหรับส่วนจัดการ */
export async function GET() {
  try {
    const branchId = await getCurrentBranchId();
    return NextResponse.json(await db.select().from(payments).where(eq(payments.branchId, branchId)));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถโหลดรายการชำระเงินได้" }, { status: 500 });
  }
}

/** บันทึกการชำระเงิน ต่ออายุสมาชิก และใช้สิทธิ์คูปองภายใน transaction เดียว */
export async function POST(request: Request) {
  try {
    const validated = paymentSchema.parse(await request.json());
    const branchId = await getCurrentBranchId();
    const [[member], [selectedPackage]] = await Promise.all([
      db
        .select({ id: members.id, status: members.status })
        .from(members)
        .where(eq(members.id, validated.memberId))
        .limit(1),
      db
        .select()
        .from(packages)
        .where(and(eq(packages.id, validated.packageId), eq(packages.isActive, true)))
        .limit(1),
    ]);
    if (!member || member.status !== "ACTIVE") {
      return NextResponse.json({ error: "สมาชิกไม่อยู่ในสถานะที่รับชำระได้" }, { status: 400 });
    }
    if (!selectedPackage) return NextResponse.json({ error: "ไม่พบแพ็กเกจที่เลือก" }, { status: 404 });

    const originalAmount = Number(selectedPackage.price);
    let promotionId: number | undefined;
    let couponQuote: Awaited<ReturnType<typeof getCouponQuote>> | undefined;
    let benefit = calculatePromotionBenefit(originalAmount);

    if (validated.couponCode) {
      couponQuote = await getCouponQuote({
        code: validated.couponCode,
        memberId: validated.memberId,
        packageId: validated.packageId,
      });
      promotionId = couponQuote.promotionId;
      benefit = couponQuote;
    } else if (validated.promotionId) {
      const [promotion] = await db
        .select()
        .from(promotions)
        .where(eq(promotions.id, validated.promotionId))
        .limit(1);
      if (!promotion || !isPromotionAvailable(promotion)) {
        return NextResponse.json({ error: "โปรโมชันไม่อยู่ในช่วงที่ใช้งานได้" }, { status: 400 });
      }
      promotionId = promotion.id;
      benefit = calculatePromotionBenefit(originalAmount, promotion);
    }

    const startDate = new Date(`${validated.startDate}T00:00:00`);
    const expireDate = new Date(startDate);
    expireDate.setDate(expireDate.getDate() + selectedPackage.durationDays + benefit.bonusDays);
    const receiptNumber = `REC${Date.now()}`;

    // ล็อกสิทธิ์ด้วยการเพิ่มตัวนับแบบมีเงื่อนไข เพื่อไม่ให้ใช้คูปองเกินจำนวนเมื่อมีคำขอพร้อมกัน
    const result = await db.transaction(async (tx) => {
      if (couponQuote) {
        const counterResult = await tx
          .update(couponCodes)
          .set({ usedCount: sql`${couponCodes.usedCount} + 1` })
          .where(
            and(
              eq(couponCodes.id, couponQuote.couponId),
              eq(couponCodes.isActive, true),
              or(isNull(couponCodes.maxUses), lt(couponCodes.usedCount, couponCodes.maxUses)),
            ),
          );
        if (counterResult[0].affectedRows !== 1) throw new CouponError("คูปองถูกใช้ครบจำนวนแล้ว");
      }

      const newPayment: NewPayment = {
        branchId,
        memberId: validated.memberId,
        promotionId,
        originalAmount: String(originalAmount),
        discountAmount: String(benefit.discountAmount),
        amount: String(benefit.finalAmount),
        method: validated.method,
        status: "PAID",
        note: validated.note,
        receiptNumber,
      };
      const paymentResult = await tx.insert(payments).values(newPayment);
      const paymentId = paymentResult[0].insertId;

      const memberPackageResult = await tx.insert(memberPackages).values({
        memberId: validated.memberId,
        packageId: validated.packageId,
        startDate,
        expireDate,
        paidAmount: Math.round(benefit.finalAmount),
        status: "ACTIVE",
      });

      if (couponQuote) {
        await tx.insert(couponRedemptions).values({
          couponId: couponQuote.couponId,
          memberId: validated.memberId,
          paymentId,
          discountAmount: String(benefit.discountAmount),
        });
      }
      return { paymentId, memberPackageId: memberPackageResult[0].insertId };
    });

    return NextResponse.json(
      {
        message: "Payment successful",
        id: result.paymentId,
        memberPackageId: result.memberPackageId,
        receiptNumber,
        originalAmount,
        discountAmount: benefit.discountAmount,
        finalAmount: benefit.finalAmount,
        bonusDays: benefit.bonusDays,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "ข้อมูลการชำระเงินไม่ถูกต้อง", details: error.issues }, { status: 400 });
    }
    if (error instanceof CouponError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถบันทึกการชำระเงินได้" }, { status: 500 });
  }
}
