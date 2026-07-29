import { db } from "@/db";
import { promotions } from "@/db/schema";
import { PromotionsManager } from "@/components/settings/promotions-manager";

export default async function PromotionsPage() {
  const data = await db.select().from(promotions);

  return (
    <div className="w-full max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-balance text-2xl font-bold sm:text-3xl">จัดการโปรโมชั่น</h1>
        <p className="text-muted-foreground text-sm">
          สร้างและจัดการโปรโมชั่นสำหรับสมาชิก
        </p>
      </div>
      <PromotionsManager data={data} />
    </div>
  );
}
