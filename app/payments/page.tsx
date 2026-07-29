import { db } from "@/db";
import { members, packages, promotions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PaymentForm } from "@/components/payments/payment-form";

export default async function PaymentsPage() {
  const memberList = await db
    .select({
      id:         members.id,
      memberCode: members.memberCode,
      firstName:  members.firstName,
      lastName:   members.lastName,
    })
    .from(members)
    .where(eq(members.status, "ACTIVE"));

  const packageList = await db
    .select()
    .from(packages)
    .where(eq(packages.isActive, true));

  const promotionList = await db
    .select()
    .from(promotions)
    .where(eq(promotions.isActive, true));

  return (
    <div className="w-full max-w-2xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-balance text-2xl font-bold sm:text-3xl">ชำระเงิน</h1>
        <p className="text-muted-foreground text-sm">
          บันทึกการชำระเงินและต่ออายุแพ็กเกจ
        </p>
      </div>
      <PaymentForm
        members={memberList}
        packages={packageList}
        promotions={promotionList}
      />
    </div>
  );
}
