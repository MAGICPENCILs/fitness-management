import { z } from "zod";

export type EquipmentCategory =
  | "CARDIO"
  | "STRENGTH"
  | "FREE_WEIGHT"
  | "ACCESSORY"
  | "OTHER";
export type EquipmentStatus =
  | "OPERATIONAL"
  | "MAINTENANCE"
  | "OUT_OF_SERVICE"
  | "RETIRED";
export type MutableEquipmentStatus = Exclude<EquipmentStatus, "RETIRED">;
export type MaintenanceType = "INSPECTION" | "PREVENTIVE" | "REPAIR";
export type MaintenanceStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED";
export type MaintenanceState = "OVERDUE" | "DUE_SOON" | "SCHEDULED" | "NONE";

const equipmentCategories = [
  "CARDIO",
  "STRENGTH",
  "FREE_WEIGHT",
  "ACCESSORY",
  "OTHER",
] as const;
const equipmentStatuses = [
  "OPERATIONAL",
  "MAINTENANCE",
  "OUT_OF_SERVICE",
  "RETIRED",
] as const;
const mutableEquipmentStatuses = [
  "OPERATIONAL",
  "MAINTENANCE",
  "OUT_OF_SERVICE",
] as const;
const maintenanceTypes = ["INSPECTION", "PREVENTIVE", "REPAIR"] as const;
const maintenanceStatuses = ["SCHEDULED", "IN_PROGRESS", "COMPLETED"] as const;

/** ตรวจวันที่ให้เป็นวันในปฏิทินจริง เพื่อไม่ให้วันที่ล้นเดือนถูกบันทึกเป็นรอบบำรุงผิดวัน */
export function parseStrictCalendarDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("INVALID_CALENDAR_DATE");
  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (parsed.toISOString().slice(0, 10) !== value)
    throw new Error("INVALID_CALENDAR_DATE");
  return value;
}

/** แปลงวันที่ที่ผ่านการตรวจแล้วเป็นจำนวนวัน UTC เพื่อไม่ให้เขตเวลาของเครื่องทำให้วันเลื่อน */
function dateToDayNumber(value: string) {
  const [year, month, day] = parseStrictCalendarDate(value).split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** จัดระดับการแจ้งเตือนจากทั้งชั่วโมงและวันที่ โดยถือว่าเงื่อนไขที่เร่งด่วนกว่ามีลำดับสูงกว่า */
export function getMaintenanceState(
  item: {
    currentUsageHours: number;
    nextMaintenanceHours: number | null;
    nextMaintenanceDate: string | null;
  },
  today: string,
): {
  maintenanceState: MaintenanceState;
  remainingHours: number | null;
  remainingDays: number | null;
} {
  const remainingHours =
    item.nextMaintenanceHours === null
      ? null
      : item.nextMaintenanceHours - item.currentUsageHours;
  const remainingDays = item.nextMaintenanceDate
    ? dateToDayNumber(item.nextMaintenanceDate) - dateToDayNumber(today)
    : null;

  if (
    (remainingHours !== null && remainingHours < 0) ||
    (remainingDays !== null && remainingDays < 0)
  )
    return { maintenanceState: "OVERDUE", remainingHours, remainingDays };
  if (
    (remainingHours !== null && remainingHours <= 50) ||
    (remainingDays !== null && remainingDays <= 7)
  )
    return { maintenanceState: "DUE_SOON", remainingHours, remainingDays };
  if (remainingHours !== null || remainingDays !== null)
    return { maintenanceState: "SCHEDULED", remainingHours, remainingDays };
  return { maintenanceState: "NONE", remainingHours, remainingDays };
}

const calendarDateSchema = z.string().refine(
  (value) => {
    try {
      parseStrictCalendarDate(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: "วันที่ไม่ถูกต้อง" },
);
const optionalDateSchema = z.union([z.literal(""), calendarDateSchema]).optional();
const expectedVersionSchema = z.coerce.number().int().positive().max(2_147_483_647);
const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(30)
  .regex(/^[A-Z0-9-]+$/);
const usageHoursSchema = z.coerce.number().int().min(0).max(10_000_000);
const maintenanceIntervalHoursSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(1_000_000);

/** รับเฉพาะตัวกรองที่อ่านได้และกำหนดขนาดหน้าโดย server เพื่อคงขีดจำกัดการค้นหา */
export const dashboardFiltersSchema = z.object({
  search: z.string().trim().max(100).default(""),
  status: z.enum(["ALL", ...equipmentStatuses]).default("ALL"),
  category: z.enum(["ALL", ...equipmentCategories]).default("ALL"),
  maintenance: z
    .enum(["ALL", "OVERDUE", "DUE_SOON", "SCHEDULED", "NONE"])
    .default("ALL"),
  tab: z.enum(["equipment", "history"]).default("equipment"),
  page: z.coerce.number().int().positive().default(1),
  historyPage: z.coerce.number().int().positive().default(1),
  pageSize: z.unknown().optional().transform(() => 20),
});

/** ตรวจข้อมูลสร้างทะเบียน รวมทั้งความสัมพันธ์ของวันซื้อและวันสิ้นสุดประกัน */
export const createEquipmentSchema = z
  .object({
    code: codeSchema,
    name: z.string().trim().min(2).max(120),
    category: z.enum(equipmentCategories),
    location: z.string().trim().min(1).max(100),
    serialNumber: z.string().trim().max(100).optional(),
    purchaseDate: optionalDateSchema,
    warrantyEndDate: optionalDateSchema,
    currentUsageHours: usageHoursSchema,
    maintenanceIntervalHours: maintenanceIntervalHoursSchema.optional(),
    nextMaintenanceDate: optionalDateSchema,
    note: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.purchaseDate ||
      !value.warrantyEndDate ||
      value.warrantyEndDate >= value.purchaseDate,
    {
      message: "วันสิ้นสุดประกันต้องไม่ก่อนวันที่ซื้อ",
      path: ["warrantyEndDate"],
    },
  );

/** จำกัด master update ให้แก้ทะเบียนเท่านั้น; interval ที่ละไว้คงเดิม ส่วน null ใช้ล้างรอบชั่วโมง */
export const updateEquipmentMasterSchema = z
  .object({
    code: codeSchema.optional(),
    name: z.string().trim().min(2).max(120).optional(),
    category: z.enum(equipmentCategories).optional(),
    location: z.string().trim().min(1).max(100).optional(),
    serialNumber: z.string().trim().max(100).optional(),
    purchaseDate: optionalDateSchema,
    warrantyEndDate: optionalDateSchema,
    maintenanceIntervalHours: maintenanceIntervalHoursSchema.nullable().optional(),
    nextMaintenanceDate: optionalDateSchema,
    note: z.string().trim().max(1000).optional(),
    expectedVersion: expectedVersionSchema,
  })
  .strict()
  .refine(
    (value) =>
      !value.purchaseDate ||
      !value.warrantyEndDate ||
      value.warrantyEndDate >= value.purchaseDate,
    {
      message: "วันสิ้นสุดประกันต้องไม่ก่อนวันที่ซื้อ",
      path: ["warrantyEndDate"],
    },
  );

/** รับสถานะปฏิบัติการเพียงสามค่า เพราะ RETIRED เป็น lifecycle ปลายทางที่ต้องใช้ workflow เฉพาะ */
export const updateEquipmentOperationSchema = z
  .object({
    currentUsageHours: usageHoursSchema,
    status: z.enum(mutableEquipmentStatuses),
    expectedVersion: expectedVersionSchema,
  })
  .strict();

/** ตรวจงานบำรุงแบบ append-only และบังคับวันที่เสร็จเมื่อปิดงานแล้ว */
export const maintenanceSchema = z
  .object({
    type: z.enum(maintenanceTypes),
    status: z.enum(maintenanceStatuses),
    scheduledDate: calendarDateSchema,
    completedDate: optionalDateSchema,
    usageHoursAtService: usageHoursSchema.optional(),
    cost: z.coerce.number().min(0).max(99_999_999.99),
    technician: z.string().trim().max(120).optional(),
    nextMaintenanceDate: optionalDateSchema,
    note: z.string().trim().max(1000).optional(),
    expectedVersion: expectedVersionSchema,
  })
  .strict()
  .refine(
    (value) => value.status !== "COMPLETED" || Boolean(value.completedDate),
    {
      message: "งานที่เสร็จแล้วต้องระบุวันที่เสร็จ",
      path: ["completedDate"],
    },
  )
  .refine(
    (value) =>
      !value.completedDate || value.completedDate >= value.scheduledDate,
    {
      message: "วันที่เสร็จต้องไม่ก่อนวันที่นัดหมาย",
      path: ["completedDate"],
    },
  );

/** บังคับเหตุผลและรุ่นข้อมูลก่อนเปลี่ยน lifecycle เพื่อเก็บประวัติอย่างตรวจสอบได้ */
export const retireEquipmentSchema = z
  .object({
    reason: z.string().trim().min(2).max(500),
    expectedVersion: expectedVersionSchema,
  })
  .strict();
