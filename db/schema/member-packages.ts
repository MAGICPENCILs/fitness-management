import { mysqlTable, int, date, datetime, mysqlEnum, timestamp } from "drizzle-orm/mysql-core";
import { members } from "./members";
import { packages } from "./packages";

export const memberPackages = mysqlTable("member_packages", {
  id:          int("id").autoincrement().primaryKey(),
  memberId:    int("member_id").notNull().references(() => members.id),
  packageId:   int("package_id").notNull().references(() => packages.id),
  startDate:   date("start_date").notNull(),
  expireDate:  date("expire_date").notNull(),
  freezeDaysUsed: int("freeze_days_used").notNull().default(0),
  status:      mysqlEnum("status", ["ACTIVE", "EXPIRED", "FROZEN", "CANCELLED"])
                .notNull()
                .default("ACTIVE"),
  paidAmount:  int("paid_amount").notNull(),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow().onUpdateNow(),
});

export type MemberPackage = typeof memberPackages.$inferSelect;
export type NewMemberPackage = typeof memberPackages.$inferInsert;