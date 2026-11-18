import { sql } from "drizzle-orm";
import { check, int, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
import { staff } from "./staff";

// แยก credentials จากกฎแจ้งเตือน และยึด destination เดียวแม้ล้าง token หรือ secret
export const lineProviderSettings = mysqlTable("line_provider_settings", {
  id: int("id").primaryKey(),
  accessTokenEncrypted: text("access_token_encrypted"),
  channelSecretEncrypted: text("channel_secret_encrypted"),
  destination: varchar("destination", { length: 33 }).notNull(),
  revision: int("revision").notNull(),
  updatedByStaffId: int("updated_by_staff_id").notNull().references(() => staff.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, () => [
  check("line_provider_settings_singleton", sql`${sql.identifier("id")} = 1`),
]);
