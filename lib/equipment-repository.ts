import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  not,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import { equipment, maintenanceRecords } from "@/db/schema";
import type {
  EquipmentCategory,
  EquipmentStatus,
  MaintenanceState,
  MaintenanceStatus,
  MaintenanceType,
} from "@/lib/equipment-core";
import type { DbTransaction } from "@/lib/audit-service";

export type EquipmentRow = typeof equipment.$inferSelect;

export class EquipmentOperationError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "EquipmentOperationError";
  }
}

export type EquipmentMutationChanges = Partial<
  Pick<
    EquipmentRow,
    | "code"
    | "name"
    | "category"
    | "location"
    | "serialNumber"
    | "purchaseDate"
    | "warrantyEndDate"
    | "maintenanceIntervalHours"
    | "nextMaintenanceDate"
    | "note"
    | "currentUsageHours"
    | "status"
    | "retiredAt"
    | "retiredReason"
  >
>;

export interface EquipmentMutationRepository {
  lockEquipment(
    equipmentId: number,
    branchId: number,
    tx: DbTransaction,
  ): Promise<EquipmentRow>;
  compareAndSetEquipment(
    equipmentId: number,
    branchId: number,
    expectedVersion: number,
    changes: EquipmentMutationChanges,
    tx: DbTransaction,
  ): Promise<void>;
}

export type EquipmentSummaryRow = {
  total: number;
  operational: number;
  maintenance: number;
  outOfService: number;
  retired: number;
  overdue: number;
  dueSoon: number;
};

export type MaintenanceRow = {
  id: number;
  equipmentId: number;
  equipmentCode: string;
  equipmentName: string;
  type: MaintenanceType;
  status: MaintenanceStatus;
  scheduledDate: string;
  completedDate: string | null;
  usageHoursAtService: number | null;
  cost: string;
  technician: string | null;
  note: string | null;
  createdAt: Date | null;
};

export type EquipmentListQuery = {
  branchId: number;
  today: string;
  search: string;
  status: EquipmentStatus | "ALL";
  category: EquipmentCategory | "ALL";
  maintenance: MaintenanceState | "ALL";
  limit: number;
  offset: number;
};

export type MaintenanceListQuery = {
  branchId: number;
  equipmentId?: number;
  type: MaintenanceType | "ALL";
  status: MaintenanceStatus | "ALL";
  limit: number;
  offset: number;
};

export interface EquipmentReadRepository {
  getSummary(branchId: number, today: string): Promise<EquipmentSummaryRow>;
  listEquipment(
    input: EquipmentListQuery,
  ): Promise<{ rows: EquipmentRow[]; total: number }>;
  listMaintenance(
    input: MaintenanceListQuery,
  ): Promise<{ rows: MaintenanceRow[]; total: number }>;
  findEquipmentDetail(
    branchId: number,
    equipmentId: number,
  ): Promise<EquipmentRow | null>;
}

/** สร้างเงื่อนไขสถานะบำรุงให้ตรงกับ equipment-core และคืน boolean SQL ที่ไม่กลายเป็น NULL เมื่อไม่มีรอบกำหนด */
function getMaintenanceCondition(
  state: MaintenanceState,
  today: string,
): SQL {
  const overdue = or(
    and(
      isNotNull(equipment.nextMaintenanceHours),
      lt(equipment.nextMaintenanceHours, equipment.currentUsageHours),
    ),
    and(
      isNotNull(equipment.nextMaintenanceDate),
      lt(equipment.nextMaintenanceDate, today),
    ),
  )!;
  const withinDueSoonThreshold = or(
    and(
      isNotNull(equipment.nextMaintenanceHours),
      lte(
        equipment.nextMaintenanceHours,
        sql`${equipment.currentUsageHours} + 50`,
      ),
    ),
    and(
      isNotNull(equipment.nextMaintenanceDate),
      lte(
        equipment.nextMaintenanceDate,
        sql`date_add(${today}, interval 7 day)`,
      ),
    ),
  )!;
  const hasSchedule = or(
    isNotNull(equipment.nextMaintenanceHours),
    isNotNull(equipment.nextMaintenanceDate),
  )!;

  if (state === "OVERDUE") return overdue;
  if (state === "DUE_SOON")
    return and(not(overdue), withinDueSoonThreshold)!;
  if (state === "SCHEDULED")
    return and(not(overdue), not(withinDueSoonThreshold), hasSchedule)!;
  return and(
    isNull(equipment.nextMaintenanceHours),
    isNull(equipment.nextMaintenanceDate),
  )!;
}

/** สร้าง where ของทะเบียนโดยวาง branch เป็นเงื่อนไขแรก ก่อน filter และ pagination ทุกครั้ง */
function getEquipmentWhere(input: EquipmentListQuery): SQL {
  const conditions: SQL[] = [eq(equipment.branchId, input.branchId)];
  if (input.search) {
    const pattern = `%${input.search}%`;
    conditions.push(
      or(
        like(equipment.code, pattern),
        like(equipment.name, pattern),
        like(equipment.serialNumber, pattern),
        like(equipment.location, pattern),
      )!,
    );
  }
  if (input.status !== "ALL")
    conditions.push(eq(equipment.status, input.status));
  if (input.category !== "ALL")
    conditions.push(eq(equipment.category, input.category));
  if (input.maintenance !== "ALL")
    conditions.push(getMaintenanceCondition(input.maintenance, input.today));
  return and(...conditions)!;
}

/** แปลง aggregate จาก MySQL เป็น number เสมอ เพราะ driver อาจคืน COUNT/SUM เป็น string ตามขนาดข้อมูล */
function mapSummaryRow(row: Record<keyof EquipmentSummaryRow, unknown>) {
  return {
    total: Number(row.total),
    operational: Number(row.operational),
    maintenance: Number(row.maintenance),
    outOfService: Number(row.outOfService),
    retired: Number(row.retired),
    overdue: Number(row.overdue),
    dueSoon: Number(row.dueSoon),
  };
}

export const equipmentReadRepository: EquipmentReadRepository = {
  /** สรุปจากทั้งสาขาเท่านั้น จึงไม่รับ filter ของหน้ารายการเข้ามาปะปนกับตัวเลขภาพรวม */
  async getSummary(branchId, today) {
    const overdue = getMaintenanceCondition("OVERDUE", today);
    const dueSoon = getMaintenanceCondition("DUE_SOON", today);
    const [row] = await db
      .select({
        total: sql<number>`count(*)`,
        operational: sql<number>`coalesce(sum(case when ${equipment.status} = 'OPERATIONAL' then 1 else 0 end), 0)`,
        maintenance: sql<number>`coalesce(sum(case when ${equipment.status} = 'MAINTENANCE' then 1 else 0 end), 0)`,
        outOfService: sql<number>`coalesce(sum(case when ${equipment.status} = 'OUT_OF_SERVICE' then 1 else 0 end), 0)`,
        retired: sql<number>`coalesce(sum(case when ${equipment.status} = 'RETIRED' then 1 else 0 end), 0)`,
        overdue: sql<number>`coalesce(sum(case when ${overdue} then 1 else 0 end), 0)`,
        dueSoon: sql<number>`coalesce(sum(case when ${dueSoon} then 1 else 0 end), 0)`,
      })
      .from(equipment)
      .where(eq(equipment.branchId, branchId));
    return mapSummaryRow(row);
  },

  /** นับและอ่านหน้าจาก where ชุดเดียวกัน เพื่อให้ total สอดคล้องกับ filter ที่ทำในฐานข้อมูล */
  async listEquipment(input) {
    const where = getEquipmentWhere(input);
    const [rows, [countRow]] = await Promise.all([
      db
        .select()
        .from(equipment)
        .where(where)
        .orderBy(
          asc(equipment.category),
          asc(equipment.name),
          asc(equipment.id),
        )
        .limit(input.limit)
        .offset(input.offset),
      db
        .select({ total: sql<number>`count(*)` })
        .from(equipment)
        .where(where),
    ]);
    return { rows, total: Number(countRow.total) };
  },

  /** จำกัดประวัติด้วย branch ผ่าน join ก่อน filter, count, limit และ offset เพื่อไม่เปิดข้อมูลข้ามสาขา */
  async listMaintenance(input) {
    const conditions: SQL[] = [eq(equipment.branchId, input.branchId)];
    if (input.equipmentId !== undefined)
      conditions.push(eq(maintenanceRecords.equipmentId, input.equipmentId));
    if (input.type !== "ALL")
      conditions.push(eq(maintenanceRecords.type, input.type));
    if (input.status !== "ALL")
      conditions.push(eq(maintenanceRecords.status, input.status));
    const where = and(...conditions)!;
    const selection = {
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
    };
    const [rows, [countRow]] = await Promise.all([
      db
        .select(selection)
        .from(maintenanceRecords)
        .innerJoin(equipment, eq(maintenanceRecords.equipmentId, equipment.id))
        .where(where)
        .orderBy(desc(maintenanceRecords.createdAt), desc(maintenanceRecords.id))
        .limit(input.limit)
        .offset(input.offset),
      db
        .select({ total: sql<number>`count(*)` })
        .from(maintenanceRecords)
        .innerJoin(equipment, eq(maintenanceRecords.equipmentId, equipment.id))
        .where(where),
    ]);
    return { rows, total: Number(countRow.total) };
  },

  /** ใช้ branch และ id ใน where เดียวกันเพื่อให้กรณีไม่พบกับข้ามสาขามีพฤติกรรมเหมือนกัน */
  async findEquipmentDetail(branchId, equipmentId) {
    const [row] = await db
      .select()
      .from(equipment)
      .where(
        and(eq(equipment.branchId, branchId), eq(equipment.id, equipmentId)),
      )
      .limit(1);
    return row ?? null;
  },
};

const EQUIPMENT_CODE_CONSTRAINT = "equipment_code_unique";

/** อ่าน property จาก error ภายนอกแบบไม่เชื่อ getter เพื่อไม่ให้ classifier กลบ error ต้นฉบับด้วย exception ใหม่ */
function readErrorProperty(error: object, key: string) {
  try {
    return Reflect.get(error, key) as unknown;
  } catch {
    return undefined;
  }
}

/** ดึงชื่อ key หลัง `for key` แล้วตัด quote/qualifier ของ MySQL เพื่อเทียบชื่อ constraint ทั้งคำ ไม่ใช้ substring */
function getMySqlDuplicateKey(value: unknown) {
  if (typeof value !== "string") return null;
  const match = /\bfor key\s+(.+?)\s*$/i.exec(value);
  if (!match?.[1]) return null;
  const normalized = match[1].replace(/[`'"]/g, "");
  const segments = normalized.split(".");
  return segments.at(-1)?.trim() || null;
}

/** ตรวจ cause chain แบบมีขอบเขต และยอมรับเฉพาะ duplicate ของ constraint รหัสอุปกรณ์เพื่อไม่แปลง DB error อื่นเป็น 409 ผิดประเภท */
function isUniqueCodeCollision(error: unknown) {
  let candidate = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!candidate || typeof candidate !== "object") return false;
    const code = readErrorProperty(candidate, "code");
    const errno = readErrorProperty(candidate, "errno");
    const message = readErrorProperty(candidate, "message");
    const sqlMessage = readErrorProperty(candidate, "sqlMessage");
    const hasDuplicateCode = code === "ER_DUP_ENTRY" || errno === 1062;
    const hasEquipmentConstraint = [message, sqlMessage].some(
      (value) => getMySqlDuplicateKey(value) === EQUIPMENT_CODE_CONSTRAINT,
    );
    if (hasDuplicateCode && hasEquipmentConstraint) return true;

    const cause = readErrorProperty(candidate, "cause");
    if (cause === candidate) return false;
    candidate = cause;
  }
  return false;
}

/** แปลงเฉพาะ unique collision เป็น domain error โดยไม่ส่งรายละเอียด SQL/driver ออกไปยัง route */
export function normalizeEquipmentWriteError(error: unknown) {
  return isUniqueCodeCollision(error)
    ? new EquipmentOperationError("รหัสอุปกรณ์นี้มีอยู่แล้ว", 409)
    : error;
}

/** ล็อกแถวด้วย id และสาขาใน transaction ของ caller เพื่อให้การตรวจ lifecycle/version อ้างอิง state เดียวกับ UPDATE */
async function lockEquipment(
  tx: DbTransaction,
  equipmentId: number,
  branchId: number,
) {
  const [row] = await tx
    .select()
    .from(equipment)
    .where(
      and(eq(equipment.id, equipmentId), eq(equipment.branchId, branchId)),
    )
    .for("update")
    .limit(1);
  if (!row) throw new EquipmentOperationError("ไม่พบอุปกรณ์", 404);
  return row;
}

export const equipmentMutationRepository: EquipmentMutationRepository = {
  async lockEquipment(equipmentId, branchId, tx) {
    return lockEquipment(tx, equipmentId, branchId);
  },

  /** ใช้ version เดิมใน WHERE และเพิ่มครั้งละหนึ่ง เพื่อให้ concurrent write ที่หลุดจาก lock ถูกปฏิเสธแทนการเขียนทับ */
  async compareAndSetEquipment(
    equipmentId,
    branchId,
    expectedVersion,
    changes,
    tx,
  ) {
    try {
      const result = await tx
        .update(equipment)
        .set({
          ...changes,
          version: sql`${equipment.version} + ${1}`,
        })
        .where(
          and(
            eq(equipment.id, equipmentId),
            eq(equipment.branchId, branchId),
            eq(equipment.version, expectedVersion),
          ),
        );
      const affectedRows = (result as unknown as [{ affectedRows?: number }])[0]
        ?.affectedRows;
      if (affectedRows !== 1)
        throw new EquipmentOperationError(
          "ข้อมูลอุปกรณ์มีการเปลี่ยนแปลง กรุณาโหลดใหม่",
          409,
        );
    } catch (error) {
      throw normalizeEquipmentWriteError(error);
    }
  },
};
