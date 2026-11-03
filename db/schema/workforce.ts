import { bigint, date, decimal, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { branches } from "./branches";
import { payments } from "./payments";
import { staff } from "./staff";

export const staffTotp = mysqlTable("staff_totp", {
  staffId: int("staff_id").primaryKey().references(() => staff.id),
  encryptedSecret: text("encrypted_secret").notNull(),
  status: mysqlEnum("status", ["PENDING", "ENABLED", "DISABLED"]).notNull().default("PENDING"),
  lastUsedStep: bigint("last_used_step", { mode: "number" }),
  enabledAt: timestamp("enabled_at"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const staffTotpRecoveryCodes = mysqlTable("staff_totp_recovery_codes", {
  id: int("id").autoincrement().primaryKey(),
  staffId: int("staff_id").notNull().references(() => staff.id),
  codeHash: varchar("code_hash", { length: 64 }).notNull().unique(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const attendancePunches = mysqlTable("attendance_punches", {
  id: int("id").autoincrement().primaryKey(),
  staffId: int("staff_id").notNull().references(() => staff.id),
  branchId: int("branch_id").notNull().references(() => branches.id),
  punchType: mysqlEnum("punch_type", ["IN", "OUT"]).notNull(),
  punchedAt: timestamp("punched_at").notNull(),
  source: mysqlEnum("source", ["SELF", "ADMIN_CORRECTION"]).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [index("attendance_staff_time_idx").on(table.staffId, table.punchedAt)]);

export const attendanceCorrections = mysqlTable("attendance_corrections", {
  id: int("id").autoincrement().primaryKey(),
  attendancePunchId: int("attendance_punch_id").notNull().references(() => attendancePunches.id),
  correctedByStaffId: int("corrected_by_staff_id").notNull().references(() => staff.id),
  originalPunchedAt: timestamp("original_punched_at").notNull(),
  correctedPunchedAt: timestamp("corrected_punched_at").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const compensationProfiles = mysqlTable("compensation_profiles", {
  staffId: int("staff_id").primaryKey().references(() => staff.id),
  baseSalary: decimal("base_salary", { precision: 12, scale: 2 }).notNull().default("0.00"),
  commissionRateBasisPoints: int("commission_rate_basis_points").notNull().default(0),
  updatedByStaffId: int("updated_by_staff_id").notNull().references(() => staff.id),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const commissionLedger = mysqlTable("commission_ledger", {
  id: int("id").autoincrement().primaryKey(),
  staffId: int("staff_id").notNull().references(() => staff.id),
  paymentId: int("payment_id").notNull().references(() => payments.id),
  salesAmount: decimal("sales_amount", { precision: 12, scale: 2 }).notNull(),
  commissionAmount: decimal("commission_amount", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [uniqueIndex("commission_payment_staff_unique").on(table.paymentId, table.staffId)]);

export const payrollSummaries = mysqlTable("payroll_summaries", {
  id: int("id").autoincrement().primaryKey(),
  staffId: int("staff_id").notNull().references(() => staff.id),
  branchId: int("branch_id").notNull().references(() => branches.id),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  baseSalary: decimal("base_salary", { precision: 12, scale: 2 }).notNull(),
  commissionAmount: decimal("commission_amount", { precision: 12, scale: 2 }).notNull(),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["DRAFT", "APPROVED"]).notNull().default("DRAFT"),
  approvedByStaffId: int("approved_by_staff_id").references(() => staff.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [uniqueIndex("payroll_staff_period_unique").on(table.staffId, table.periodStart, table.periodEnd)]);
