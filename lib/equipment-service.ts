import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { equipment, maintenanceRecords } from "@/db/schema";
import { withTransaction, type DbTransaction } from "@/lib/audit-service";
import {
  getMaintenanceState,
  type EquipmentCategory,
  type MaintenanceStatus,
  type MaintenanceType,
  type MutableEquipmentStatus,
} from "@/lib/equipment-core";

export class EquipmentOperationError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "EquipmentOperationError";
  }
}

/** โหลดทะเบียนพร้อมระดับแจ้งเตือนและประวัติล่าสุด เพื่อให้หน้าอุปกรณ์เปิดได้ด้วยข้อมูลจาก Server Component รอบเดียว */
export async function getEquipmentDashboard(today: string, branchId: number) {
  const [equipmentRows, historyRows] = await Promise.all([
    db
      .select()
      .from(equipment)
      .where(eq(equipment.branchId, branchId))
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
      .where(eq(equipment.branchId, branchId))
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
  branchId: number;
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
}, executor?: DbTransaction) {
  const database = executor ?? db;
  const [existing] = await database
    .select({ id: equipment.id })
    .from(equipment)
    .where(eq(equipment.code, input.code))
    .limit(1);
  if (existing)
    throw new EquipmentOperationError("รหัสอุปกรณ์นี้มีอยู่แล้ว", 409);

  const result = await database.insert(equipment).values({
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
  branchId: number,
  input: { currentUsageHours: number; status: MutableEquipmentStatus },
  executor?: DbTransaction,
) {
  const database = executor ?? db;
  const [current] = await database
    .select({
      id: equipment.id,
      currentUsageHours: equipment.currentUsageHours,
      status: equipment.status,
    })
    .from(equipment)
    .where(and(eq(equipment.id, equipmentId), eq(equipment.branchId, branchId)))
    .limit(1);
  if (!current) throw new EquipmentOperationError("ไม่พบอุปกรณ์", 404);
  if (current.status === "RETIRED")
    throw new EquipmentOperationError("อุปกรณ์นี้เลิกใช้งานแล้ว", 409);
  if (input.currentUsageHours < current.currentUsageHours)
    throw new EquipmentOperationError(
      "ชั่วโมงใช้งานใหม่ต้องไม่น้อยกว่าค่าปัจจุบัน",
    );

  await database
    .update(equipment)
    .set(input)
    .where(and(eq(equipment.id, equipmentId), eq(equipment.branchId, branchId)));
}

/** บันทึกงานบำรุงใน transaction และตั้งรอบถัดไปอัตโนมัติเมื่อปิดงานเรียบร้อย */
export async function recordMaintenance(
  equipmentId: number,
  branchId: number,
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
  executor?: DbTransaction,
) {
  return withTransaction(executor, async (tx) => {
    const [current] = await tx
      .select({
        id: equipment.id,
        currentUsageHours: equipment.currentUsageHours,
        maintenanceIntervalHours: equipment.maintenanceIntervalHours,
      })
      .from(equipment)
      .where(and(eq(equipment.id, equipmentId), eq(equipment.branchId, branchId)))
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
