import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  date,
  decimal,
} from "drizzle-orm/mysql-core";
import { members } from "./members";
import { branches } from "./branches";

export const lockers = mysqlTable("lockers", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branch_id").notNull().default(1).references(() => branches.id),
  code: varchar("code", { length: 20 }).notNull().unique(),
  zone: varchar("zone", { length: 50 }).notNull(),
  status: mysqlEnum("status", ["AVAILABLE", "OCCUPIED"])
    .notNull()
    .default("AVAILABLE"),
  monthlyRate: decimal("monthly_rate", { precision: 10, scale: 2 }),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const lockerRentals = mysqlTable(
  "locker_rentals",
  {
    id: int("id").autoincrement().primaryKey(),
    lockerId: int("locker_id")
      .notNull()
      .references(() => lockers.id),
    memberId: int("member_id")
      .notNull()
      .references(() => members.id),
    rentalType: mysqlEnum("rental_type", ["USAGE", "MONTHLY"]).notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    price: decimal("price", { precision: 10, scale: 2 })
      .notNull()
      .default("0.00"),
    status: mysqlEnum("status", ["ACTIVE", "COMPLETED", "CANCELLED"])
      .notNull()
      .default("ACTIVE"),
    note: text("note"),
    checkedOutAt: timestamp("checked_out_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("locker_rentals_locker_id_idx").on(table.lockerId),
    index("locker_rentals_member_id_idx").on(table.memberId),
    index("locker_rentals_status_idx").on(table.status),
  ],
);

export type Locker = typeof lockers.$inferSelect;
export type NewLocker = typeof lockers.$inferInsert;
export type LockerRental = typeof lockerRentals.$inferSelect;
export type NewLockerRental = typeof lockerRentals.$inferInsert;
