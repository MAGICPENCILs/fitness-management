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

export const equipment = mysqlTable(
  "equipment",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 30 }).notNull().unique(),
    name: varchar("name", { length: 120 }).notNull(),
    category: mysqlEnum("category", [
      "CARDIO",
      "STRENGTH",
      "FREE_WEIGHT",
      "ACCESSORY",
      "OTHER",
    ]).notNull(),
    location: varchar("location", { length: 100 }).notNull(),
    serialNumber: varchar("serial_number", { length: 100 }),
    status: mysqlEnum("status", [
      "OPERATIONAL",
      "MAINTENANCE",
      "OUT_OF_SERVICE",
    ])
      .notNull()
      .default("OPERATIONAL"),
    purchaseDate: date("purchase_date", { mode: "string" }),
    warrantyEndDate: date("warranty_end_date", { mode: "string" }),
    currentUsageHours: int("current_usage_hours").notNull().default(0),
    maintenanceIntervalHours: int("maintenance_interval_hours"),
    nextMaintenanceHours: int("next_maintenance_hours"),
    nextMaintenanceDate: date("next_maintenance_date", { mode: "string" }),
    lastMaintenanceDate: date("last_maintenance_date", { mode: "string" }),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => [
    index("equipment_status_idx").on(table.status),
    index("equipment_category_idx").on(table.category),
    index("equipment_next_maintenance_date_idx").on(table.nextMaintenanceDate),
  ],
);

export const maintenanceRecords = mysqlTable(
  "maintenance_records",
  {
    id: int("id").autoincrement().primaryKey(),
    equipmentId: int("equipment_id")
      .notNull()
      .references(() => equipment.id),
    type: mysqlEnum("type", ["INSPECTION", "PREVENTIVE", "REPAIR"]).notNull(),
    status: mysqlEnum("status", [
      "SCHEDULED",
      "IN_PROGRESS",
      "COMPLETED",
    ]).notNull(),
    scheduledDate: date("scheduled_date", { mode: "string" }).notNull(),
    completedDate: date("completed_date", { mode: "string" }),
    usageHoursAtService: int("usage_hours_at_service"),
    cost: decimal("cost", { precision: 10, scale: 2 }).notNull().default("0.00"),
    technician: varchar("technician", { length: 120 }),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("maintenance_equipment_id_idx").on(table.equipmentId),
    index("maintenance_status_idx").on(table.status),
    index("maintenance_scheduled_date_idx").on(table.scheduledDate),
  ],
);

export type Equipment = typeof equipment.$inferSelect;
export type NewEquipment = typeof equipment.$inferInsert;
export type MaintenanceRecord = typeof maintenanceRecords.$inferSelect;
export type NewMaintenanceRecord = typeof maintenanceRecords.$inferInsert;
