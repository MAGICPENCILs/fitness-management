import {
  date,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { members } from "./members";
import { branches } from "./branches";

export const trainers = mysqlTable(
  "trainers",
  {
    id: int("id").autoincrement().primaryKey(),
    branchId: int("branch_id").notNull().default(1).references(() => branches.id),
    code: varchar("code", { length: 20 }).notNull().unique(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    specialty: varchar("specialty", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    status: mysqlEnum("status", ["ACTIVE", "INACTIVE"])
      .notNull()
      .default("ACTIVE"),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => [index("trainers_status_idx").on(table.status)],
);

export const fitnessClasses = mysqlTable(
  "classes",
  {
    id: int("id").autoincrement().primaryKey(),
    branchId: int("branch_id").notNull().default(1).references(() => branches.id),
    trainerId: int("trainer_id")
      .notNull()
      .references(() => trainers.id),
    name: varchar("name", { length: 120 }).notNull(),
    category: mysqlEnum("category", [
      "YOGA",
      "ZUMBA",
      "SPINNING",
      "STRENGTH",
      "OTHER",
    ]).notNull(),
    room: varchar("room", { length: 100 }).notNull(),
    classDate: date("class_date", { mode: "string" }).notNull(),
    startTime: varchar("start_time", { length: 5 }).notNull(),
    endTime: varchar("end_time", { length: 5 }).notNull(),
    capacity: int("capacity").notNull(),
    status: mysqlEnum("status", ["SCHEDULED", "CANCELLED", "COMPLETED"])
      .notNull()
      .default("SCHEDULED"),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => [
    index("classes_trainer_date_idx").on(table.trainerId, table.classDate),
    index("classes_status_date_idx").on(table.status, table.classDate),
  ],
);

export const classBookings = mysqlTable(
  "class_bookings",
  {
    id: int("id").autoincrement().primaryKey(),
    classId: int("class_id")
      .notNull()
      .references(() => fitnessClasses.id),
    memberId: int("member_id")
      .notNull()
      .references(() => members.id),
    status: mysqlEnum("status", [
      "CONFIRMED",
      "CANCELLED",
      "ATTENDED",
      "NO_SHOW",
    ])
      .notNull()
      .default("CONFIRMED"),
    bookedAt: timestamp("booked_at").defaultNow(),
    cancelledAt: timestamp("cancelled_at"),
  },
  (table) => [
    uniqueIndex("class_bookings_class_member_unique").on(
      table.classId,
      table.memberId,
    ),
    index("class_bookings_class_status_idx").on(table.classId, table.status),
    index("class_bookings_member_idx").on(table.memberId),
  ],
);

export type Trainer = typeof trainers.$inferSelect;
export type FitnessClass = typeof fitnessClasses.$inferSelect;
export type ClassBooking = typeof classBookings.$inferSelect;
