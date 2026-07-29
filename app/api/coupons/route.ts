import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { couponCodes, NewCouponCode, promotions } from "@/db/schema";

const couponSchema = z.object({
  code: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_-]+$/),
  promotionId: z.number().int().positive(),
  maxUses: z.number().int().positive().nullable().optional(),
  perMemberLimit: z.number().int().positive().max(100).default(1),
  minPurchase: z.number().nonnegative().default(0),
});

/** โหลดรายการคูปองพร้อมข้อมูลโปรโมชันสำหรับหน้าจัดการคูปอง */
export async function GET() {
  try {
    const result = await db
      .select({
        id: couponCodes.id,
        code: couponCodes.code,
        promotionId: couponCodes.promotionId,
        promotionName: promotions.name,
        promotionType: promotions.type,
        promotionValue: promotions.value,
        maxUses: couponCodes.maxUses,
        usedCount: couponCodes.usedCount,
        perMemberLimit: couponCodes.perMemberLimit,
        minPurchase: couponCodes.minPurchase,
        isActive: couponCodes.isActive,
        createdAt: couponCodes.createdAt,
      })
      .from(couponCodes)
      .innerJoin(promotions, eq(couponCodes.promotionId, promotions.id))
      .orderBy(desc(couponCodes.createdAt));
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถโหลดคูปองได้" }, { status: 500 });
  }
}

/** ตรวจสอบข้อมูลและสร้างคูปองใหม่ โดยบังคับให้รหัสไม่ซ้ำกัน */
export async function POST(request: Request) {
  try {
    const validated = couponSchema.parse(await request.json());
    const [promotion] = await db
      .select({ id: promotions.id })
      .from(promotions)
      .where(eq(promotions.id, validated.promotionId))
      .limit(1);
    if (!promotion) return NextResponse.json({ error: "ไม่พบโปรโมชันที่เลือก" }, { status: 404 });

    const newCoupon: NewCouponCode = {
      code: validated.code.toUpperCase(),
      promotionId: validated.promotionId,
      maxUses: validated.maxUses ?? null,
      perMemberLimit: validated.perMemberLimit,
      minPurchase: String(validated.minPurchase),
      isActive: true,
    };
    const result = await db.insert(couponCodes).values(newCoupon);
    return NextResponse.json({ id: result[0].insertId, message: "สร้างคูปองแล้ว" }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "ข้อมูลคูปองไม่ถูกต้อง", details: error.issues }, { status: 400 });
    }
    if (typeof error === "object" && error && "errno" in error && error.errno === 1062) {
      return NextResponse.json({ error: "รหัสคูปองนี้มีอยู่แล้ว" }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถสร้างคูปองได้" }, { status: 500 });
  }
}
