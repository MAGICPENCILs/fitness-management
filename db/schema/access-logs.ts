import { mysqlTable, int, varchar, mysqlEnum, timestamp } from "drizzle-orm/mysql-core";
import { members } from "./members";
import { branches } from "./branches";

export const accessLogs = mysqlTable("access_logs", {
  id:        int("id").autoincrement().primaryKey(),
  branchId:  int("branch_id").notNull().default(1).references(() => branches.id),
  memberId:  int("member_id").references(() => members.id),
  serial:    varchar("serial", { length: 20 }),
  result:    mysqlEnum("result", ["APPROVED", "REJECTED"]).notNull(),
  reason:    varchar("reason", { length: 255 }),
  scannedAt: timestamp("scanned_at").defaultNow(),
});

export type AccessLog = typeof accessLogs.$inferSelect;
export type NewAccessLog = typeof accessLogs.$inferInsert;
