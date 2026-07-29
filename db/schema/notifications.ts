import {
  boolean,
  date,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { memberPackages } from "./member-packages";
import { members } from "./members";

export const notificationSettings = mysqlTable("notification_settings", {
  id: int("id").primaryKey(),
  reminderDays: varchar("reminder_days", { length: 50 }).notNull().default("7,3,1"),
  inactivityDays: int("inactivity_days").notNull().default(30),
  enableInApp: boolean("enable_in_app").notNull().default(true),
  enableSms: boolean("enable_sms").notNull().default(false),
  enableLine: boolean("enable_line").notNull().default(false),
  enableEmail: boolean("enable_email").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    memberId: int("member_id").notNull().references(() => members.id),
    memberPackageId: int("member_package_id").references(() => memberPackages.id),
    type: mysqlEnum("type", ["EXPIRY_REMINDER", "INACTIVITY", "SCAN_WARNING"]).notNull(),
    channel: mysqlEnum("channel", ["IN_APP", "SMS", "LINE", "EMAIL"]).notNull(),
    status: mysqlEnum("status", ["QUEUED", "SENT", "FAILED", "SKIPPED"])
      .notNull()
      .default("QUEUED"),
    recipient: varchar("recipient", { length: 191 }),
    title: varchar("title", { length: 150 }).notNull(),
    message: text("message").notNull(),
    scheduledFor: date("scheduled_for").notNull(),
    dedupeKey: varchar("dedupe_key", { length: 191 }).notNull(),
    errorMessage: varchar("error_message", { length: 255 }),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("notifications_dedupe_key_unique").on(table.dedupeKey),
    index("notifications_member_id_idx").on(table.memberId),
    index("notifications_status_idx").on(table.status),
    index("notifications_scheduled_for_idx").on(table.scheduledFor),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationSetting = typeof notificationSettings.$inferSelect;
