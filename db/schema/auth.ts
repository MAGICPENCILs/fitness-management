import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/mysql-core";
import { staff } from "./staff";

export const authSessions = mysqlTable(
  "auth_sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    staffId: int("staff_id")
      .notNull()
      .references(() => staff.id),
    // เก็บเฉพาะ SHA-256 hash เพื่อไม่ให้ค่าจากฐานข้อมูลนำไปใช้เป็น session token ได้โดยตรง
    sessionTokenHash: varchar("session_token_hash", { length: 64 }).notNull(),
    mode: mysqlEnum("mode", ["FULL", "PASSWORD_CHANGE_REQUIRED"]).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at").notNull(),
    idleExpiresAt: timestamp("idle_expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    revokedReason: mysqlEnum("revoked_reason", [
      "LOGOUT",
      "PASSWORD_CHANGED",
      "PASSWORD_RESET",
      "STAFF_UPDATED",
      "ADMIN_REVOKED",
      "EXPIRED",
    ]),
    ipFingerprint: varchar("ip_fingerprint", { length: 64 }),
    userAgentCategory: varchar("user_agent_category", { length: 50 }),
  },
  (table) => [
    unique("auth_session_token_hash_unique").on(table.sessionTokenHash),
    index("auth_session_staff_status_expiry_idx").on(
      table.staffId,
      table.revokedAt,
      table.absoluteExpiresAt,
      table.idleExpiresAt,
    ),
  ],
);

export const authLoginLimits = mysqlTable(
  "auth_login_limits",
  {
    id: int("id").autoincrement().primaryKey(),
    scope: mysqlEnum("scope", ["ACCOUNT", "IP"]).notNull(),
    // subject เป็น HMAC fingerprint เพื่อไม่บันทึก staff code หรือ IP address ดิบ
    subjectHash: varchar("subject_hash", { length: 64 }).notNull(),
    attemptCount: int("attempt_count").notNull().default(0),
    windowStartedAt: timestamp("window_started_at").notNull(),
    lockedUntil: timestamp("locked_until"),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    unique("auth_limit_scope_subject_unique").on(
      table.scope,
      table.subjectHash,
    ),
    index("auth_limit_scope_locked_until_idx").on(
      table.scope,
      table.lockedUntil,
    ),
  ],
);

export type AuthSession = typeof authSessions.$inferSelect;
export type AuthLoginLimit = typeof authLoginLimits.$inferSelect;
