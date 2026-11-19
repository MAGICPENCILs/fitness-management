import { sql } from "drizzle-orm";
import { check, int, mysqlTable, timestamp } from "drizzle-orm/mysql-core";

/** เก็บกฎเข้าใช้ที่ต้องปรับได้แบบ singleton เพื่อให้ทุกจุดสแกนใช้ค่าเดียวกัน */
export const accessSettings = mysqlTable("access_settings", {
  id: int("id").primaryKey(),
  graceDays: int("grace_days").notNull().default(3),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, () => [
  check("access_settings_singleton", sql`${sql.identifier("id")} = 1`),
  check("access_settings_grace_days_range", sql`${sql.identifier("grace_days")} between 3 and 7`),
]);

export type AccessSetting = typeof accessSettings.$inferSelect;
