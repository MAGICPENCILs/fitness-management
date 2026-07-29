import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { equipment, maintenanceRecords } from "@/db/schema";

export type EquipmentCategory =
  | "CARDIO"
  | "STRENGTH"
  | "FREE_WEIGHT"
  | "ACCESSORY"
  | "OTHER";
export type EquipmentStatus =
  | "OPERATIONAL"
  | "MAINTENANCE"
  | "OUT_OF_SERVICE";
export type MaintenanceType = "INSPECTION" | "PREVENTIVE" | "REPAIR";
export type MaintenanceStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED";

export class EquipmentOperationError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "EquipmentOperationError";
  }
}

/** แปลงวันที่แบบ YYYY-MM-DD เป็นจำนวนวัน UTC เพื่อเทียบกำหนดโดยไม่ให้เขตเวลาของเครื่องทำให้วันเลื่อน */
function dateToDayNumber(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** จัดระดับการแจ้งเตือนจากทั้งชั่วโมงและวันที่ โดยถือว่าเงื่อนไขที่เร่งด่วนกว่ามีลำดับสูงกว่า */
function getMaintenanceState(
  item: {
    currentUsageHours: number;
    nextMaintenanceHours: number | null;
    nextMaintenanceDate: string | null;
  },
  today: string,
) {
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
    return { maintenanceState: "OVERDUE" as const, remainingHours, remainingDays };
  if (
    (remainingHours !== null && remainingHours <= 50) ||
    (remainingDays !== null && remainingDays <= 7)
  )
    return { maintenanceState: "DUE_SOON" as const, remainingHours, remainingDays };
  if (remainingHours !== null || remainingDays !== null)
    return { maintenanceState: "SCHEDULED" as const, remainingHours, remainingDays };
  return { maintenanceState: "NONE" as const, remainingHours, remainingDays };
}

/** โหลดทะเบียนพร้อมระดับแจ้งเตือนและประวัติล่าสุด เพื่อให้หน้าอุปกรณ์เปิดได้ด้วยข้อมูลจาก Server Component รอบเดียว */
export async function getEquipmentDashboard(today: string) {
  const [equipmentRows, historyRows] = await Promise.all([
    db
      .select()
      .from(equipment)
      .orderBy(equipment.category, equipment.name),
    db
      .select({
        id: maintenanceRecords.id,
        equipmentId: maintenanceRecords.equipmentId,
        equipmentCode: equipment.code,
        equipmentName: equipment.name,
        type: maintenanceRecords.type,
        status: maintenanceRecords.status,
        scheduledDate: maintenanceRecords.scheduledDate,
        completedDate: maintenanceRecords.completedDate,
        usageHoursAtService: maintenanceRecords.usageHoursAtService,
        cost: maintenanceRecords.cost,
        technician: maintenanceRecords.technician,
        note: maintenanceRecords.note,
        createdAt: maintenanceRecords.createdAt,
      })
      .from(maintenanceRecords)
      .innerJoin(equipment, eq(maintenanceRecords.equipmentId, equipment.id))
      .orderBy(desc(maintenanceRecords.createdAt))
      .limit(50),
  ]);

  return {
    equipment: equipmentRows.map((item) => ({
      ...item,
      ...getMaintenanceState(item, today),
      createdAt: item.createdAt?.toISOString() ?? null,
      updatedAt: item.updatedAt?.toISOString() ?? null,
    })),
    history: historyRows.map((item) => ({
      ...item,
      cost: Number(item.cost),
      createdAt: item.createdAt?.toISOString() ?? null,
    })),
  };
}

/** เพิ่มอุปกรณ์พร้อมคำนวณชั่วโมงบำรุงรักษาครั้งแรกจากค่ามิเตอร์ปัจจุบัน */
export async function createEquipment(input: {
  code: string;
  name: string;
  category: EquipmentCategory;
  location: string;
  serialNumber?: string;
  purchaseDate?: string;
  warrantyEndDate?: string;
  currentUsageHours: number;
  maintenanceIntervalHours?: number;
  nextMaintenanceDate?: string;
  note?: string;
}) {
  const [existing] = await db
    .select({ id: equipment.id })
    .from(equipment)
    .where(eq(equipment.code, input.code))
    .limit(1);
  if (existing)
    throw new EquipmentOperationError("รหัสอุปกรณ์นี้มีอยู่แล้ว", 409);

  const result = await db.insert(equipment).values({
    ...input,
    serialNumber: input.serialNumber || null,
    purchaseDate: input.purchaseDate || null,
    warrantyEndDate: input.warrantyEndDate || null,
    maintenanceIntervalHours: input.maintenanceIntervalHours ?? null,
    nextMaintenanceHours: input.maintenanceIntervalHours
      ? input.currentUsageHours + input.maintenanceIntervalHours
      : null,
    nextMaintenanceDate: input.nextMaintenanceDate || null,
    note: input.note || null,
  });
  return result[0].insertId;
}

/** อัปเดตมิเตอร์แบบเพิ่มขึ้นเท่านั้นเพื่อรักษาความน่าเชื่อถือของรอบบำรุง และเปลี่ยนสถานะตามการตรวจหน้างาน */
export async function updateEquipmentOperation(
  equipmentId: number,
  input: { currentUsageHours: number; status: EquipmentStatus },
) {
  const [current] = await db
    .select({ id: equipment.id, currentUsageHours: equipment.currentUsageHours })
    .from(equipment)
    .where(eq(equipment.id, equipmentId))
    .limit(1);
  if (!current) throw new EquipmentOperationError("ไม่พบอุปกรณ์", 404);
  if (input.currentUsageHours < current.currentUsageHours)
    throw new EquipmentOperationError(
      "ชั่วโมงใช้งานใหม่ต้องไม่น้อยกว่าค่าปัจจุบัน",
    );

  await db
    .update(equipment)
    .set(input)
    .where(eq(equipment.id, equipmentId));
}

/** บันทึกงานบำรุงใน transaction และตั้งรอบถัดไปอัตโนมัติเมื่อปิดงานเรียบร้อย */
export async function recordMaintenance(
  equipmentId: number,
  input: {
    type: MaintenanceType;
    status: MaintenanceStatus;
    scheduledDate: string;
    completedDate?: string;
    usageHoursAtService?: number;
    cost: number;
    technician?: string;
    nextMaintenanceDate?: string;
    note?: string;
  },
) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: equipment.id,
        currentUsageHours: equipment.currentUsageHours,
        maintenanceIntervalHours: equipment.maintenanceIntervalHours,
      })
      .from(equipment)
      .where(eq(equipment.id, equipmentId))
      .limit(1);
    if (!current) throw new EquipmentOperationError("ไม่พบอุปกรณ์", 404);

    const serviceHours = input.usageHoursAtService ?? current.currentUsageHours;
    if (serviceHours < current.currentUsageHours)
      throw new EquipmentOperationError(
        "ชั่วโมง ณ วันที่บำรุงต้องไม่น้อยกว่าค่าปัจจุบัน",
      );

    const result = await tx.insert(maintenanceRecords).values({
      equipmentId,
      type: input.type,
      status: input.status,
      scheduledDate: input.scheduledDate,
      completedDate: input.completedDate || null,
      usageHoursAtService: serviceHours,
      cost: String(input.cost),
      technician: input.technician || null,
      note: input.note || null,
    });

    if (input.status === "IN_PROGRESS") {
      await tx
        .update(equipment)
        .set({ status: "MAINTENANCE" })
        .where(eq(equipment.id, equipmentId));
    }

    if (input.status === "COMPLETED") {
      await tx
        .update(equipment)
        .set({
          status: "OPERATIONAL",
          currentUsageHours: serviceHours,
          lastMaintenanceDate: input.completedDate!,
          nextMaintenanceHours: current.maintenanceIntervalHours
            ? serviceHours + current.maintenanceIntervalHours
            : null,
          nextMaintenanceDate: input.nextMaintenanceDate || null,
        })
        .where(eq(equipment.id, equipmentId));
    }

    return result[0].insertId;
  });
}
