import { mysqlTable, int, decimal, varchar, text, mysqlEnum, timestamp } from "drizzle-orm/mysql-core";
import { members } from "./members";

export const payments = mysqlTable("payments", {
  id:            int("id").autoincrement().primaryKey(),
  memberId:      int("member_id").notNull().references(() => members.id),
  amount:        decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method:        mysqlEnum("method", ["CASH", "QR_PROMPTPAY", "TRANSFER", "CREDIT_CARD"]).notNull(),
  status:        mysqlEnum("status", ["PAID", "PENDING", "REFUNDED"]).notNull().default("PAID"),
  note:          text("note"),
  receiptNumber: varchar("receipt_number", { length: 20 }).unique(),
  createdAt:     timestamp("created_at").defaultNow(),
});

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;