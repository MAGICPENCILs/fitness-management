import { date, decimal, int, mysqlEnum, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { mysqlTable } from "drizzle-orm/mysql-core";
import { branches } from "./branches";

export const expenses = mysqlTable("expenses", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branch_id").notNull().default(1).references(() => branches.id),
  expenseDate: date("expense_date", { mode: "string" }).notNull(),
  category: mysqlEnum("category", ["WATER", "ELECTRICITY", "SALARY", "REPAIR", "SUPPLIES", "OTHER"]).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: mysqlEnum("payment_method", ["CASH", "TRANSFER", "CREDIT_CARD"]).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  referenceNumber: varchar("reference_number", { length: 100 }),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const cashReconciliations = mysqlTable("cash_reconciliations", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branch_id").notNull().default(1).references(() => branches.id),
  reconciliationDate: date("reconciliation_date", { mode: "string" }).notNull(),
  openingCash: decimal("opening_cash", { precision: 12, scale: 2 }).notNull(),
  cashIncome: decimal("cash_income", { precision: 12, scale: 2 }).notNull(),
  cashExpenses: decimal("cash_expenses", { precision: 12, scale: 2 }).notNull(),
  expectedCash: decimal("expected_cash", { precision: 12, scale: 2 }).notNull(),
  actualCash: decimal("actual_cash", { precision: 12, scale: 2 }).notNull(),
  difference: decimal("difference", { precision: 12, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["BALANCED", "OVER", "SHORT"]).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => [
  uniqueIndex("cash_reconciliations_branch_date_unique").on(
    table.branchId,
    table.reconciliationDate,
  ),
]);

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type CashReconciliation = typeof cashReconciliations.$inferSelect;
export type NewCashReconciliation = typeof cashReconciliations.$inferInsert;
