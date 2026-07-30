import { mysqlTable, int, decimal, varchar, text, mysqlEnum, timestamp } from "drizzle-orm/mysql-core";
import { members } from "./members";
import { promotions } from "./promotions";
import { branches } from "./branches";

export const payments = mysqlTable("payments", {
  id:            int("id").autoincrement().primaryKey(),
  branchId:      int("branch_id").notNull().default(1).references(() => branches.id),
  memberId:      int("member_id").notNull().references(() => members.id),
  promotionId:   int("promotion_id").references(() => promotions.id),
  originalAmount: decimal("original_amount", { precision: 10, scale: 2 }),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
  amount:        decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method:        mysqlEnum("method", ["CASH", "QR_PROMPTPAY", "TRANSFER", "CREDIT_CARD"]).notNull(),
  status:        mysqlEnum("status", ["PAID", "PENDING", "REFUNDED"]).notNull().default("PAID"),
  note:          text("note"),
  receiptNumber: varchar("receipt_number", { length: 20 }).unique(),
  createdAt:     timestamp("created_at").defaultNow(),
});

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
