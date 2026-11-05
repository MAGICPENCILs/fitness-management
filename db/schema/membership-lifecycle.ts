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
import { memberPackages } from "./member-packages";
import { members } from "./members";
import { staff } from "./staff";

export const freezeRecords = mysqlTable(
  "freeze_records",
  {
    id: int("id").autoincrement().primaryKey(),
    memberId: int("member_id").notNull().references(() => members.id),
    memberPackageId: int("member_package_id").notNull().references(() => memberPackages.id),
    branchId: int("branch_id").notNull().references(() => branches.id),
    requestedDays: int("requested_days").notNull(),
    freezeYear: int("freeze_year").notNull(),
    reason: text("reason").notNull(),
    status: mysqlEnum("status", ["ACTIVE", "COMPLETED", "CANCELLED"]).notNull().default("ACTIVE"),
    activeKey: varchar("active_key", { length: 16 }),
    startedAt: timestamp("started_at").notNull(),
    endedAt: timestamp("ended_at"),
    createdByStaffId: int("created_by_staff_id").notNull().references(() => staff.id),
    endedByStaffId: int("ended_by_staff_id").references(() => staff.id),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("freeze_records_member_active_unique").on(table.memberId, table.activeKey),
    index("freeze_records_member_year_idx").on(table.memberId, table.freezeYear),
  ],
);

export const memberAccessTokens = mysqlTable(
  "member_access_tokens",
  {
    id: int("id").autoincrement().primaryKey(),
    memberId: int("member_id").notNull().references(() => members.id),
    branchId: int("branch_id").notNull().references(() => branches.id),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    issuedByStaffId: int("issued_by_staff_id").references(() => staff.id),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("member_access_tokens_member_idx").on(table.memberId),
    index("member_access_tokens_expiry_idx").on(table.expiresAt),
  ],
);
