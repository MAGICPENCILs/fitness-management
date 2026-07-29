import {
  date,
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { members } from "./members";
import { trainers } from "./classes";

export const ptPackages = mysqlTable(
  "pt_packages",
  {
    id: int("id").autoincrement().primaryKey(),
    memberId: int("member_id")
      .notNull()
      .references(() => members.id),
    trainerId: int("trainer_id")
      .notNull()
      .references(() => trainers.id),
    name: varchar("name", { length: 120 }).notNull(),
    totalSessions: int("total_sessions").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    status: mysqlEnum("status", ["ACTIVE", "COMPLETED", "CANCELLED"])
      .notNull()
      .default("ACTIVE"),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => [
    index("pt_packages_member_status_idx").on(table.memberId, table.status),
    index("pt_packages_trainer_status_idx").on(table.trainerId, table.status),
    index("pt_packages_end_date_idx").on(table.endDate),
  ],
);

export const ptSessions = mysqlTable(
  "pt_sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    packageId: int("package_id")
      .notNull()
      .references(() => ptPackages.id),
    scheduledDate: date("scheduled_date", { mode: "string" }).notNull(),
    startTime: varchar("start_time", { length: 5 }).notNull(),
    endTime: varchar("end_time", { length: 5 }).notNull(),
    status: mysqlEnum("status", ["SCHEDULED", "COMPLETED", "CANCELLED"])
      .notNull()
      .default("SCHEDULED"),
    weightKg: decimal("weight_kg", { precision: 6, scale: 2 }),
    bmi: decimal("bmi", { precision: 5, scale: 2 }),
    waistCm: decimal("waist_cm", { precision: 6, scale: 2 }),
    workoutSummary: text("workout_summary"),
    trainerNote: text("trainer_note"),
    completedAt: timestamp("completed_at"),
    cancelledAt: timestamp("cancelled_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => [
    index("pt_sessions_package_status_idx").on(table.packageId, table.status),
    index("pt_sessions_schedule_idx").on(table.scheduledDate, table.startTime),
  ],
);

export type PtPackage = typeof ptPackages.$inferSelect;
export type PtSession = typeof ptSessions.$inferSelect;
