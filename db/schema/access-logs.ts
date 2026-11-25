import { date, int, mysqlEnum, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { members } from "./members";
import { branches } from "./branches";
import { accessScanPoints } from "./access-scan-points";

export const accessLogs = mysqlTable("access_logs", {
  id:        int("id").autoincrement().primaryKey(),
  branchId:  int("branch_id").notNull().default(1).references(() => branches.id),
  memberId:  int("member_id").references(() => members.id),
  serial:    varchar("serial", { length: 20 }),
  result:    mysqlEnum("result", ["APPROVED", "REJECTED"]).notNull(),
  reason:    varchar("reason", { length: 255 }),
  scannedAt: timestamp("scanned_at").defaultNow(),
  dailyUseDate: date("daily_use_date", { mode: "string" }),
  // null หมายถึงประวัติเดิมหรือเครื่อง legacy ที่ไม่ได้ระบุจุด ห้ามเดาตำแหน่งย้อนหลัง
  scanPointId: int("scan_point_id").references(() => accessScanPoints.id),
}, table => [
  uniqueIndex("access_logs_member_daily_use_unique").on(table.memberId, table.dailyUseDate),
]);

export type AccessLog = typeof accessLogs.$inferSelect;
export type NewAccessLog = typeof accessLogs.$inferInsert;
