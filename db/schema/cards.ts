import { mysqlTable, varchar, int, mysqlEnum, timestamp } from "drizzle-orm/mysql-core";
import { members } from "./members";

export const cardPool = mysqlTable("card_pool", {
  id:           int("id").autoincrement().primaryKey(),
  serial:       varchar("serial", { length: 20 }).notNull().unique(),
  status:       mysqlEnum("status", ["AVAILABLE", "IN_USE", "LOST"])
                  .notNull()
                  .default("AVAILABLE"),
  memberId:     int("member_id").references(() => members.id),
  assignedAt:   timestamp("assigned_at"),
  createdAt:    timestamp("created_at").defaultNow(),
});

export type CardPool = typeof cardPool.$inferSelect;
export type NewCardPool = typeof cardPool.$inferInsert;