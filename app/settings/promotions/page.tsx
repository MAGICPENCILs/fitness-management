import { db } from "@/db";
import { couponCodes, promotions } from "@/db/schema";
import { PromotionsManager } from "@/components/settings/promotions-manager";
import { CouponsManager } from "@/components/settings/coupons-manager";
import { desc, eq } from "drizzle-orm";

export default async function PromotionsPage() {
  const [data, coupons] = await Promise.all([
    db.select().from(promotions),
    db
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
      })
      .from(couponCodes)
      .innerJoin(promotions, eq(couponCodes.promotionId, promotions.id))
      .orderBy(desc(couponCodes.createdAt)),
  ]);

  return (
    <div className="w-full max-w-5xl space-y-8 p-4 sm:p-6 lg:p-8">
      <div>
        <p className="mb-1 text-sm font-medium text-primary">เครื่องมือการขาย</p>
        <h1 className="text-balance text-2xl font-bold sm:text-3xl">โปรโมชันและคูปอง</h1>
        <p className="text-pretty text-sm text-muted-foreground">
          สร้างสิทธิประโยชน์ กำหนดช่วงเวลา และออกคูปองสำหรับสมาชิก
        </p>
      </div>
      <section className="space-y-4" aria-labelledby="promotions-heading">
        <div>
          <h2 id="promotions-heading" className="text-balance text-lg font-semibold">โปรโมชัน</h2>
          <p className="text-pretty text-sm text-muted-foreground">กำหนดส่วนลดหรือวันใช้งานโบนัสที่เคาน์เตอร์นำไปใช้ได้</p>
        </div>
        <PromotionsManager data={data} />
      </section>
      <section className="border-t pt-8" aria-labelledby="coupons-heading">
        <span id="coupons-heading" className="sr-only">คูปองโค้ด</span>
        <CouponsManager
          coupons={coupons}
          promotions={data.map(({ id, name, type, value }) => ({ id, name, type, value }))}
        />
      </section>
    </div>
  );
}
