import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { branches } from "./branches";
import { members } from "./members";
import { staff } from "./staff";

export const consentEvents = mysqlTable(
  "consent_events",
  {
    id: int("id").autoincrement().primaryKey(),
    memberId: int("member_id")
      .notNull()
      .references(() => members.id),
    branchId: int("branch_id")
      .notNull()
      .references(() => branches.id),
    recordedByStaffId: int("recorded_by_staff_id")
      .notNull()
      .references(() => staff.id),
    consentType: mysqlEnum("consent_type", [
      "SERVICE_PRIVACY",
      "MARKETING",
      "PHOTO",
    ]).notNull(),
    action: mysqlEnum("action", ["GRANTED", "WITHDRAWN"]).notNull(),
    policyVersion: varchar("policy_version", { length: 30 }).notNull(),
    source: mysqlEnum("source", [
      "FRONT_DESK",
      "MIGRATION",
      "PRIVACY_REQUEST",
      "ONLINE",
    ]).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("consent_member_type_created_idx").on(
      table.memberId,
      table.consentType,
      table.createdAt,
    ),
  ],
);

export const privacyRequests = mysqlTable(
  "privacy_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    memberId: int("member_id")
      .notNull()
      .references(() => members.id),
    branchId: int("branch_id")
      .notNull()
      .references(() => branches.id),
    requestType: mysqlEnum("request_type", ["ANONYMIZATION"]).notNull(),
    status: mysqlEnum("status", [
      "PENDING",
      "APPROVED",
      "COMPLETED",
      "REJECTED",
    ])
      .notNull()
      .default("PENDING"),
    openRequestKey: varchar("open_request_key", { length: 30 }),
    reason: text("reason").notNull(),
    requestedByStaffId: int("requested_by_staff_id")
      .notNull()
      .references(() => staff.id),
    requestedAt: timestamp("requested_at").defaultNow(),
    reviewedByStaffId: int("reviewed_by_staff_id").references(() => staff.id),
    reviewedAt: timestamp("reviewed_at"),
    reviewNote: text("review_note"),
    completedAt: timestamp("completed_at"),
    fileCleanupStatus: mysqlEnum("file_cleanup_status", [
      "NOT_REQUIRED",
      "PENDING",
      "COMPLETED",
      "FAILED",
    ])
      .notNull()
      .default("NOT_REQUIRED"),
    fileCleanupError: varchar("file_cleanup_error", { length: 100 }),
  },
  (table) => [
    uniqueIndex("privacy_member_open_unique").on(
      table.memberId,
      table.openRequestKey,
    ),
    index("privacy_branch_status_idx").on(table.branchId, table.status),
  ],
);

export const privacyFileCleanups = mysqlTable(
  "privacy_file_cleanups",
  {
    id: int("id").autoincrement().primaryKey(),
    memberId: int("member_id")
      .notNull()
      .references(() => members.id),
    privacyRequestId: int("privacy_request_id").references(
      () => privacyRequests.id,
    ),
    source: mysqlEnum("source", [
      "PHOTO_CONSENT_WITHDRAWAL",
      "ANONYMIZATION",
    ]).notNull(),
    quarantineToken: varchar("quarantine_token", { length: 64 })
      .notNull(),
    status: mysqlEnum("status", ["PENDING", "COMPLETED", "FAILED"])
      .notNull()
      .default("PENDING"),
    errorCode: varchar("error_code", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    uniqueIndex("privacy_cleanup_token_unique").on(table.quarantineToken),
    index("privacy_cleanup_status_idx").on(table.status, table.createdAt),
  ],
);

export type ConsentEvent = typeof consentEvents.$inferSelect;
export type PrivacyRequest = typeof privacyRequests.$inferSelect;
export type PrivacyFileCleanup = typeof privacyFileCleanups.$inferSelect;
