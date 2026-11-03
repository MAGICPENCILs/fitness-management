import {
  boolean,
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

export const memberApplications = mysqlTable(
  "member_applications",
  {
    id: int("id").autoincrement().primaryKey(),
    branchId: int("branch_id").notNull().references(() => branches.id),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    email: varchar("email", { length: 191 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    servicePrivacyConsent: boolean("service_privacy_consent").notNull(),
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    policyVersion: varchar("policy_version", { length: 30 }).notNull(),
    status: mysqlEnum("status", ["PENDING", "APPROVED", "REJECTED"]).notNull().default("PENDING"),
    reviewNote: text("review_note"),
    reviewedByStaffId: int("reviewed_by_staff_id").references(() => staff.id),
    reviewedAt: timestamp("reviewed_at"),
    memberId: int("member_id").references(() => members.id),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("member_applications_email_unique").on(table.email),
    index("member_applications_branch_status_idx").on(table.branchId, table.status),
  ],
);

export const memberAccounts = mysqlTable("member_accounts", {
  id: int("id").autoincrement().primaryKey(),
  memberId: int("member_id").notNull().unique().references(() => members.id),
  email: varchar("email", { length: 191 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["ACTIVE", "INACTIVE"]).notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const memberSessions = mysqlTable(
  "member_sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    memberAccountId: int("member_account_id").notNull().references(() => memberAccounts.id),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull(),
  },
  (table) => [
    uniqueIndex("member_sessions_token_hash_unique").on(table.tokenHash),
    index("member_sessions_account_expiry_idx").on(table.memberAccountId, table.expiresAt, table.revokedAt),
  ],
);
