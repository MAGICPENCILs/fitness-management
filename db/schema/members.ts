import { mysqlTable, varchar, text, date, datetime, mysqlEnum, int, timestamp } from "drizzle-orm/mysql-core";
import { branches } from "./branches";

export const members = mysqlTable("members", {
  id:          int("id").autoincrement().primaryKey(),
  homeBranchId: int("home_branch_id").notNull().default(1).references(() => branches.id),
  memberCode:  varchar("member_code", { length: 20 }).notNull().unique(),
  firstName:   varchar("first_name", { length: 100 }).notNull(),
  lastName:    varchar("last_name", { length: 100 }).notNull(),
  idCard:      varchar("id_card", { length: 13 }).unique(),
  phone:       varchar("phone", { length: 20 }),
  email:       varchar("email", { length: 100 }),
  birthDate:   date("birth_date"),
  gender:      mysqlEnum("gender", ["MALE", "FEMALE", "OTHER"]),
  address:     text("address"),
  photoUrl:    varchar("photo_url", { length: 255 }),
  status:      mysqlEnum("status", ["ACTIVE", "EXPIRED", "FROZEN", "SUSPENDED", "CANCELLED"])
                .notNull()
                .default("ACTIVE"),
  note:        text("note"),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow().onUpdateNow(),
});

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
