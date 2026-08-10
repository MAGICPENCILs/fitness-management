import {
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { branches } from "./branches";
import { staff } from "./staff";

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    branchId: int("branch_id")
      .references(() => branches.id),
    actorStaffId: int("actor_staff_id")
      .references(() => staff.id),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 60 }).notNull(),
    entityId: int("entity_id"),
    result: mysqlEnum("result", ["SUCCESS", "DENIED", "FAILED"]).notNull(),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("audit_branch_created_idx").on(table.branchId, table.createdAt),
    index("audit_actor_created_idx").on(table.actorStaffId, table.createdAt),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
