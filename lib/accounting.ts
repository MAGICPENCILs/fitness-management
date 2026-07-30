import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { expenses, payments } from "@/db/schema";

/** แปลงวันที่จากฟอร์มเป็นช่วงเวลาไทย เพื่อให้รายการปลายวันไม่หลุดไปอยู่วันถัดไป */
export function getBangkokDayRange(date: string) {
  return {
    start: new Date(`${date}T00:00:00.000+07:00`),
    end: new Date(`${date}T23:59:59.999+07:00`),
  };
}

/** รวมรายรับจากการชำระสำเร็จและรายจ่ายที่บันทึก เพื่อใช้เป็นแหล่งข้อมูลเดียวของหน้าบัญชีและไฟล์ส่งออก */
export async function getAccountingSnapshot(from: string, to: string, branchId: number) {
  const fromRange = getBangkokDayRange(from);
  const toRange = getBangkokDayRange(to);
  const [incomeRows, expenseRows] = await Promise.all([
    db
      .select({
        id: payments.id,
        date: payments.createdAt,
        amount: payments.amount,
        method: payments.method,
        referenceNumber: payments.receiptNumber,
        description: payments.note,
      })
      .from(payments)
      .where(and(eq(payments.branchId, branchId), eq(payments.status, "PAID"), gte(payments.createdAt, fromRange.start), lte(payments.createdAt, toRange.end)))
      .orderBy(asc(payments.createdAt)),
    db.select().from(expenses).where(and(eq(expenses.branchId, branchId), gte(expenses.expenseDate, from), lte(expenses.expenseDate, to))).orderBy(asc(expenses.expenseDate)),
  ]);

  const totalIncome = incomeRows.reduce((sum, item) => sum + Number(item.amount), 0);
  const totalExpense = expenseRows.reduce((sum, item) => sum + Number(item.amount), 0);
  const cashIncome = incomeRows.filter((item) => item.method === "CASH").reduce((sum, item) => sum + Number(item.amount), 0);
  const cashExpense = expenseRows.filter((item) => item.paymentMethod === "CASH").reduce((sum, item) => sum + Number(item.amount), 0);

  const transactions = [
    ...incomeRows.map((item) => ({
      id: `income-${item.id}`,
      type: "INCOME" as const,
      date: item.date?.toISOString() ?? null,
      description: item.description || "รับชำระค่าสมาชิก",
      category: "MEMBERSHIP" as const,
      method: item.method,
      referenceNumber: item.referenceNumber,
      amount: Number(item.amount),
    })),
    ...expenseRows.map((item) => ({
      id: `expense-${item.id}`,
      type: "EXPENSE" as const,
      date: item.expenseDate,
      description: item.description,
      category: item.category,
      method: item.paymentMethod,
      referenceNumber: item.referenceNumber,
      amount: Number(item.amount),
    })),
  ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  return {
    period: { from, to },
    summary: { totalIncome, totalExpense, netProfit: totalIncome - totalExpense, cashIncome, cashExpense },
    transactions,
  };
}
