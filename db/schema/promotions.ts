import {
  mysqlTable, int, varchar, text,
  decimal, boolean, date, mysqlEnum, timestamp
} from "drizzle-orm/mysql-core";

export const promotions = mysqlTable("promotions", {
  id:          int("id").autoincrement().primaryKey(),
  name:        varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  type:        mysqlEnum("type", ["DISCOUNT_AMOUNT", "DISCOUNT_PERCENT", "BONUS_DAYS"])
                 .notNull(),
  value:       decimal("value", { precision: 10, scale: 2 }).notNull(),
  startDate:   date("start_date").notNull(),
  endDate:     date("end_date").notNull(),
  isActive:    boolean("is_active").notNull().default(true),
  createdAt:   timestamp("created_at").defaultNow(),
});

export type Promotion = typeof promotions.$inferSelect;
export type NewPromotion = typeof promotions.$inferInsert;