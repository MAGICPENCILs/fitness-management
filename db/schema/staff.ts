import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { branches } from "./branches";

export const staff = mysqlTable(
  "staff",
  {
    id: int("id").autoincrement().primaryKey(),
    staffCode: varchar("staff_code", { length: 20 }).notNull().unique(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    homeBranchId: int("home_branch_id")
      .notNull()
      .references(() => branches.id),
    role: mysqlEnum("role", ["OWNER", "MANAGER", "COUNTER", "TRAINER"])
      .notNull(),
    phone: varchar("phone", { length: 20 }),
    email: varchar("email", { length: 100 }),
    // คง hash และเวลาที่เปลี่ยนรหัสผ่านเป็น nullable เพื่อให้ migration รองรับบัญชีเดิมที่ยัง bootstrap ไม่เสร็จ
    passwordHash: varchar("password_hash", { length: 255 }),
    passwordChangedAt: timestamp("password_changed_at"),
    mustChangePassword: boolean("must_change_password")
      .notNull()
      .default(true),
    status: mysqlEnum("status", ["ACTIVE", "INACTIVE"])
      .notNull()
      .default("ACTIVE"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => [
    index("staff_branch_status_idx").on(table.homeBranchId, table.status),
  ],
);

export type Staff = typeof staff.$inferSelect;
export type NewStaff = typeof staff.$inferInsert;
