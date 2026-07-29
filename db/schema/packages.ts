import { mysqlTable, varchar, text, int, decimal, boolean, mysqlEnum, timestamp } from "drizzle-orm/mysql-core";

export const packages = mysqlTable("packages", {
  id:          int("id").autoincrement().primaryKey(),
  name:        varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  type:        mysqlEnum("type", ["DAILY", "MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "CUSTOM"])
                .notNull(),
  durationDays: int("duration_days").notNull(),
  price:       decimal("price", { precision: 10, scale: 2 }).notNull(),
  isActive:    boolean("is_active").notNull().default(true),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow().onUpdateNow(),
});

export type Package = typeof packages.$inferSelect;
export type NewPackage = typeof packages.$inferInsert;