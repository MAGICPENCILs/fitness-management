import { and, eq, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { cashReconciliations, expenses, payments } from "@/db/schema";
import { getBangkokDayRange } from "@/lib/accounting";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const reconciliationSchema = z.object({
  reconciliationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  openingCash: z.coerce.number().min(0).max(9999999999.99),
  actualCash: z.coerce.number().min(0).max(9999999999.99),
  note: z.string().trim().max(1000).optional(),
});

/** คำนวณยอดเงินสดจากธุรกรรมฝั่งเซิร์ฟเวอร์ก่อนบันทึก เพื่อป้องกันยอดคาดการณ์ถูกแก้จากหน้าเว็บ */
export async function POST(request: Request) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("accounting.manage", branchId, {
      action: "CASH_RECONCILIATION_SAVED",
      entityType: "CASH_RECONCILIATION",
    });
    const validated = reconciliationSchema.parse(await request.json());
    const range = getBangkokDayRange(validated.reconciliationDate);
    const [incomeRows, expenseRows] = await Promise.all([
      db.select({ amount: payments.amount }).from(payments).where(and(eq(payments.branchId, branchId), eq(payments.status, "PAID"), eq(payments.method, "CASH"), gte(payments.createdAt, range.start), lte(payments.createdAt, range.end))),
      db.select({ amount: expenses.amount }).from(expenses).where(and(eq(expenses.branchId, branchId), eq(expenses.paymentMethod, "CASH"), eq(expenses.expenseDate, validated.reconciliationDate))),
    ]);
    const cashIncome = incomeRows.reduce((sum, item) => sum + Number(item.amount), 0);
    const cashExpenses = expenseRows.reduce((sum, item) => sum + Number(item.amount), 0);
    const expectedCash = validated.openingCash + cashIncome - cashExpenses;
    const difference = validated.actualCash - expectedCash;
    const status = Math.abs(difference) < 0.01 ? "BALANCED" : difference > 0 ? "OVER" : "SHORT";

    await runAuditedMutation(
      { actorStaffId: actor.staffId, branchId, action: "CASH_RECONCILIATION_SAVED", entityType: "CASH_RECONCILIATION", metadata: { status } },
      (tx) => tx.insert(cashReconciliations).values({
        branchId,
        reconciliationDate: validated.reconciliationDate,
        openingCash: String(validated.openingCash),
        cashIncome: String(cashIncome),
        cashExpenses: String(cashExpenses),
        expectedCash: String(expectedCash),
        actualCash: String(validated.actualCash),
        difference: String(difference),
        status,
        note: validated.note || null,
      }).onDuplicateKeyUpdate({
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
      }),
    );

    return NextResponse.json({ message: "กระทบยอดเงินสดแล้ว", reconciliation: { cashIncome, cashExpenses, expectedCash, actualCash: validated.actualCash, difference, status } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "ข้อมูลกระทบยอดไม่ถูกต้อง", details: error.issues }, { status: 400 });
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถกระทบยอดเงินสดได้" }, { status: 500 });
  }
}
