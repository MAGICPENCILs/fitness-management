import {
  boolean,
  date,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { members } from "./members";

export const memberCrmProfiles = mysqlTable("member_crm_profiles", {
  memberId: int("member_id")
    .primaryKey()
    .references(() => members.id),
  interests: varchar("interests", { length: 500 }),
  fitnessGoals: varchar("fitness_goals", { length: 500 }),
  preferredContact: mysqlEnum("preferred_contact", [
    "PHONE",
    "LINE",
    "SMS",
    "EMAIL",
    "NONE",
  ])
    .notNull()
    .default("PHONE"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const crmInteractions = mysqlTable("crm_interactions", {
  id: int("id").autoincrement().primaryKey(),
  memberId: int("member_id")
    .notNull()
    .references(() => members.id),
  channel: mysqlEnum("channel", [
    "NOTE",
    "PHONE",
    "LINE",
    "SMS",
    "EMAIL",
    "IN_PERSON",
  ]).notNull(),
  summary: varchar("summary", { length: 1000 }).notNull(),
  followUpDate: date("follow_up_date", { mode: "string" }),
  status: mysqlEnum("status", ["OPEN", "COMPLETED"])
    .notNull()
    .default("OPEN"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const loyaltyRewards = mysqlTable("loyalty_rewards", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  description: text("description"),
  pointsRequired: int("points_required").notNull(),
  stock: int("stock"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const loyaltyPoints = mysqlTable("loyalty_points", {
  id: int("id").autoincrement().primaryKey(),
  memberId: int("member_id")
    .notNull()
    .references(() => members.id),
  type: mysqlEnum("type", ["EARN", "REDEEM"]).notNull(),
  points: int("points").notNull(),
  source: varchar("source", { length: 120 }).notNull(),
  note: varchar("note", { length: 500 }),
  rewardId: int("reward_id").references(() => loyaltyRewards.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export type MemberCrmProfile = typeof memberCrmProfiles.$inferSelect;
export type CrmInteraction = typeof crmInteractions.$inferSelect;
export type LoyaltyReward = typeof loyaltyRewards.$inferSelect;
export type LoyaltyPoint = typeof loyaltyPoints.$inferSelect;
