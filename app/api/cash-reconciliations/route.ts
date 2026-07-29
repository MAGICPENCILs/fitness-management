import { and, eq, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { cashReconciliations, expenses, payments } from "@/db/schema";
import { getBangkokDayRange } from "@/lib/accounting";

const reconciliationSchema = z.object({
  reconciliationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  openingCash: z.coerce.number().min(0).max(9999999999.99),
  actualCash: z.coerce.number().min(0).max(9999999999.99),
  note: z.string().trim().max(1000).optional(),
});

/** คำนวณยอดเงินสดจากธุรกรรมฝั่งเซิร์ฟเวอร์ก่อนบันทึก เพื่อป้องกันยอดคาดการณ์ถูกแก้จากหน้าเว็บ */
export async function POST(request: Request) {
  try {
    const validated = reconciliationSchema.parse(await request.json());
    const range = getBangkokDayRange(validated.reconciliationDate);
    const [incomeRows, expenseRows] = await Promise.all([
      db.select({ amount: payments.amount }).from(payments).where(and(eq(payments.status, "PAID"), eq(payments.method, "CASH"), gte(payments.createdAt, range.start), lte(payments.createdAt, range.end))),
      db.select({ amount: expenses.amount }).from(expenses).where(and(eq(expenses.paymentMethod, "CASH"), eq(expenses.expenseDate, validated.reconciliationDate))),
    ]);
    const cashIncome = incomeRows.reduce((sum, item) => sum + Number(item.amount), 0);
    const cashExpenses = expenseRows.reduce((sum, item) => sum + Number(item.amount), 0);
    const expectedCash = validated.openingCash + cashIncome - cashExpenses;
    const difference = validated.actualCash - expectedCash;
    const status = Math.abs(difference) < 0.01 ? "BALANCED" : difference > 0 ? "OVER" : "SHORT";

    await db
      .insert(cashReconciliations)
      .values({
        reconciliationDate: validated.reconciliationDate,
        openingCash: String(validated.openingCash),
        cashIncome: String(cashIncome),
        cashExpenses: String(cashExpenses),
        expectedCash: String(expectedCash),
        actualCash: String(validated.actualCash),
        difference: String(difference),
        status,
        note: validated.note || null,
      })
      .onDuplicateKeyUpdate({
        set: {
          openingCash: String(validated.openingCash),
          cashIncome: String(cashIncome),
          cashExpenses: String(cashExpenses),
          expectedCash: String(expectedCash),
          actualCash: String(validated.actualCash),
          difference: String(difference),
          status,
          note: validated.note || null,
        },
      });

    return NextResponse.json({ message: "กระทบยอดเงินสดแล้ว", reconciliation: { cashIncome, cashExpenses, expectedCash, actualCash: validated.actualCash, difference, status } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "ข้อมูลกระทบยอดไม่ถูกต้อง", details: error.issues }, { status: 400 });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถกระทบยอดเงินสดได้" }, { status: 500 });
  }
}
