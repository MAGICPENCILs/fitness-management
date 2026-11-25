import { int, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { branches } from "./branches";

export const accessScanPoints = mysqlTable("access_scan_points", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branch_id").notNull().references(() => branches.id),
  name: varchar("name", { length: 80 }).notNull(),
}, table => [uniqueIndex("access_scan_points_branch_name_unique").on(table.branchId, table.name)]);
