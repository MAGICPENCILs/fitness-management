import { eq } from "drizzle-orm";
import { db } from "@/db";
import { equipment } from "@/db/schema";
import type { DbTransaction } from "@/lib/audit-service";
import {
  dashboardFiltersSchema,
  getMaintenanceState,
  type EquipmentCategory,
  type EquipmentStatus,
  type MaintenanceState,
  type MaintenanceStatus,
  type MaintenanceType,
  type MutableEquipmentStatus,
} from "@/lib/equipment-core";
import {
  equipmentMutationRepository,
  equipmentReadRepository,
  EquipmentOperationError,
  normalizeEquipmentWriteError,
  type EquipmentMutationChanges,
  type EquipmentMutationRepository,
  type EquipmentReadRepository,
  type EquipmentRow,
  type EquipmentSummaryRow,
  type MaintenanceRow,
} from "@/lib/equipment-repository";

export { EquipmentOperationError } from "@/lib/equipment-repository";

type CoreDashboardFilters = ReturnType<typeof dashboardFiltersSchema.parse>;

export type EquipmentDashboardFilters = CoreDashboardFilters & {
  historyEquipmentId?: number | null;
  historyType?: MaintenanceType | "ALL";
  historyStatus?: MaintenanceStatus | "ALL";
};

export type EquipmentDto = {
  id: number;
  code: string;
  name: string;
  category: EquipmentCategory;
  location: string;
  serialNumber: string | null;
  status: EquipmentStatus;
  retiredAt: string | null;
  retiredReason: string | null;
  version: number;
  purchaseDate: string | null;
  warrantyEndDate: string | null;
  currentUsageHours: number;
  maintenanceIntervalHours: number | null;
  nextMaintenanceHours: number | null;
  nextMaintenanceDate: string | null;
  lastMaintenanceDate: string | null;
  note: string | null;
  maintenanceState: MaintenanceState;
  remainingHours: number | null;
  remainingDays: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type MaintenanceDto = Omit<MaintenanceRow, "cost" | "createdAt"> & {
  cost: number;
  createdAt: string | null;
};

export type PaginationDto = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type EquipmentDashboardDto = {
  summary: EquipmentSummaryRow;
  equipment: EquipmentDto[];
  history: MaintenanceDto[];
  equipmentPagination: PaginationDto;
  historyPagination: PaginationDto;
};

export type EquipmentDetailDto = {
  equipment: EquipmentDto;
  history: MaintenanceDto[];
  historyPagination: PaginationDto;
};

export type EquipmentSearchParams = Record<
  string,
  string | string[] | undefined
>;

const dashboardFilterDefaults = dashboardFiltersSchema.parse({});
const maintenanceTypes = new Set<MaintenanceType>([
  "INSPECTION",
  "PREVENTIVE",
  "REPAIR",
]);
const maintenanceStatuses = new Set<MaintenanceStatus>([
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
]);

/** อ่านเฉพาะ query value ค่าเดี่ยว เพราะค่าซ้ำเป็น input คลุมเครือและต้องตกกลับค่า default */
function getSingleSearchParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

/** ใช้ schema จาก equipment-core ตรวจทีละ field เพื่อเก็บ field อื่นที่ถูกต้องไว้เมื่อ query บางตัวไม่ปลอดภัย */
function parseCoreFilter<K extends keyof CoreDashboardFilters>(
  key: K,
  value: string | string[] | undefined,
): CoreDashboardFilters[K] {
  const parsed = dashboardFiltersSchema.shape[key].safeParse(
    getSingleSearchParam(value),
  );
  return parsed.success
    ? (parsed.data as CoreDashboardFilters[K])
    : dashboardFilterDefaults[key];
}

/** แปลง async searchParams เป็น allowlist ที่ตรวจแล้ว และไม่ส่ง raw query ไปถึง repository */
export function parseEquipmentDashboardFilters(
  searchParams: EquipmentSearchParams,
): EquipmentDashboardFilters {
  const equipmentIdValue = getSingleSearchParam(
    searchParams.historyEquipmentId,
  );
  const historyEquipmentId =
    equipmentIdValue && /^\d+$/.test(equipmentIdValue)
      ? Number(equipmentIdValue)
      : null;
  const historyTypeValue = getSingleSearchParam(searchParams.historyType);
  const historyStatusValue = getSingleSearchParam(searchParams.historyStatus);

  return {
    search: parseCoreFilter("search", searchParams.search),
    status: parseCoreFilter("status", searchParams.status),
    category: parseCoreFilter("category", searchParams.category),
    maintenance: parseCoreFilter("maintenance", searchParams.maintenance),
    tab: parseCoreFilter("tab", searchParams.tab),
    page: parseCoreFilter("page", searchParams.page),
    historyPage: parseCoreFilter("historyPage", searchParams.historyPage),
    pageSize: parseCoreFilter("pageSize", searchParams.pageSize),
    historyEquipmentId:
      historyEquipmentId &&
      Number.isSafeInteger(historyEquipmentId) &&
      historyEquipmentId <= 2_147_483_647
        ? historyEquipmentId
        : null,
    historyType:
      historyTypeValue &&
      maintenanceTypes.has(historyTypeValue as MaintenanceType)
        ? (historyTypeValue as MaintenanceType)
        : "ALL",
    historyStatus:
      historyStatusValue &&
      maintenanceStatuses.has(historyStatusValue as MaintenanceStatus)
        ? (historyStatusValue as MaintenanceStatus)
        : "ALL",
  };
}

/** แปลงแถวอุปกรณ์เป็น DTO แบบ explicit เพื่อไม่เผลอส่ง branchId หรือ Date object ข้ามไป client */
function mapEquipmentDto(item: EquipmentRow, today: string): EquipmentDto {
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    category: item.category,
    location: item.location,
    serialNumber: item.serialNumber,
    status: item.status,
    retiredAt: item.retiredAt?.toISOString() ?? null,
    retiredReason: item.retiredReason,
    version: item.version,
    purchaseDate: item.purchaseDate,
    warrantyEndDate: item.warrantyEndDate,
    currentUsageHours: item.currentUsageHours,
    maintenanceIntervalHours: item.maintenanceIntervalHours,
    nextMaintenanceHours: item.nextMaintenanceHours,
    nextMaintenanceDate: item.nextMaintenanceDate,
    lastMaintenanceDate: item.lastMaintenanceDate,
    note: item.note,
    ...getMaintenanceState(item, today),
    createdAt: item.createdAt?.toISOString() ?? null,
    updatedAt: item.updatedAt?.toISOString() ?? null,
  };
}

/** แปลง decimal และ timestamp ของประวัติเป็น primitive ที่ React Server Components serialize ได้แน่นอน */
function mapMaintenanceDto(item: MaintenanceRow): MaintenanceDto {
  return {
    id: item.id,
    equipmentId: item.equipmentId,
    equipmentCode: item.equipmentCode,
    equipmentName: item.equipmentName,
    type: item.type,
    status: item.status,
    scheduledDate: item.scheduledDate,
    completedDate: item.completedDate,
    usageHoursAtService: item.usageHoursAtService,
    cost: Number(item.cost),
    technician: item.technician,
    note: item.note,
    createdAt: item.createdAt?.toISOString() ?? null,
  };
}

/** สร้าง metadata หน้าโดยตรึง page size ฝั่ง server ไม่เชื่อค่าที่ caller ส่งเข้ามา */
function getPagination(page: number, total: number): PaginationDto {
  const pageSize = 20;
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

/** แยก orchestration จาก Drizzle เพื่อให้ทดสอบ scope, filter, pagination และ DTO ด้วย fake repository แคบ ๆ */
export function createEquipmentReadService(repository: EquipmentReadRepository) {
  return {
    async getEquipmentDashboard(
      today: string,
      branchId: number,
      filters: EquipmentDashboardFilters,
    ): Promise<EquipmentDashboardDto> {
      const pageSize = 20;
      const [summary, equipmentResult, historyResult] = await Promise.all([
        repository.getSummary(branchId, today),
        repository.listEquipment({
          branchId,
          today,
          search: filters.search,
          status: filters.status,
          category: filters.category,
          maintenance: filters.maintenance,
          limit: pageSize,
          offset: (filters.page - 1) * pageSize,
        }),
        repository.listMaintenance({
          branchId,
          equipmentId: filters.historyEquipmentId ?? undefined,
          type: filters.historyType ?? "ALL",
          status: filters.historyStatus ?? "ALL",
          limit: pageSize,
          offset: (filters.historyPage - 1) * pageSize,
        }),
      ]);

      return {
        summary,
        equipment: equipmentResult.rows.map((item) =>
          mapEquipmentDto(item, today),
        ),
        history: historyResult.rows.map(mapMaintenanceDto),
        equipmentPagination: getPagination(filters.page, equipmentResult.total),
        historyPagination: getPagination(
          filters.historyPage,
          historyResult.total,
        ),
      };
    },

    async getEquipmentDetail(
      today: string,
      branchId: number,
      equipmentId: number,
      historyPage: number,
    ): Promise<EquipmentDetailDto> {
      const item = await repository.findEquipmentDetail(branchId, equipmentId);
      if (!item) throw new EquipmentOperationError("ไม่พบอุปกรณ์", 404);
      const historyResult = await repository.listMaintenance({
        branchId,
        equipmentId,
        type: "ALL",
        status: "ALL",
        limit: 20,
        offset: (historyPage - 1) * 20,
      });
      return {
        equipment: mapEquipmentDto(item, today),
        history: historyResult.rows.map(mapMaintenanceDto),
        historyPagination: getPagination(historyPage, historyResult.total),
      };
    },
  };
}

const equipmentReadService = createEquipmentReadService(
  equipmentReadRepository,
);

/** โหลด dashboard ผ่าน repository ที่บังคับ branch scope และ SQL pagination */
export async function getEquipmentDashboard(
  today: string,
  branchId: number,
  filters: EquipmentDashboardFilters,
) {
  return equipmentReadService.getEquipmentDashboard(today, branchId, filters);
}

/** โหลด detail และประวัติด้วย branch scope เดียวกัน โดยคืน 404 แบบควบคุมเมื่อ entity อยู่นอกขอบเขต */
export async function getEquipmentDetail(
  today: string,
  branchId: number,
  equipmentId: number,
  historyPage: number,
) {
  return equipmentReadService.getEquipmentDetail(
    today,
    branchId,
    equipmentId,
    historyPage,
  );
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
  const normalizedCode = input.code.trim().toUpperCase();
  const [existing] = await database
    .select({ id: equipment.id })
    .from(equipment)
    .where(eq(equipment.code, normalizedCode))
    .limit(1);
  if (existing)
    throw new EquipmentOperationError(
      "รหัสอุปกรณ์นี้มีอยู่แล้ว",
      409,
      "EQUIPMENT_CODE_CONFLICT",
    );

  try {
    const result = await database.insert(equipment).values({
      ...input,
      code: normalizedCode,
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
  } catch (error) {
    throw normalizeEquipmentWriteError(error);
  }
}

export type UpdateEquipmentMasterInput = {
  code?: string;
  name?: string;
  category?: EquipmentCategory;
  location?: string;
  serialNumber?: string;
  purchaseDate?: string;
  warrantyEndDate?: string;
  maintenanceIntervalHours?: number | null;
  nextMaintenanceDate?: string;
  note?: string;
  expectedVersion: number;
};

export type UpdateEquipmentOperationInput = {
  currentUsageHours: number;
  status: MutableEquipmentStatus;
  expectedVersion: number;
};

export type RetireEquipmentInput = {
  reason: string;
  expectedVersion: number;
};

export type MaintenanceInput = {
  type: MaintenanceType;
  status: MaintenanceStatus;
  scheduledDate: string;
  completedDate?: string;
  usageHoursAtService?: number;
  cost: number;
  technician?: string;
  nextMaintenanceDate?: string;
  note?: string;
  expectedVersion: number;
};

const masterInputKeys = new Set([
  "code",
  "name",
  "category",
  "location",
  "serialNumber",
  "purchaseDate",
  "warrantyEndDate",
  "maintenanceIntervalHours",
  "nextMaintenanceDate",
  "note",
  "expectedVersion",
]);

/** กันทุก mutation หลัง RETIRED เพราะสถานะปลายทางต้องไม่ถูกฟื้นหรือเปลี่ยนข้อมูลย้อนหลัง */
function assertMutableLifecycle(status: EquipmentStatus) {
  if (status === "RETIRED")
    throw new EquipmentOperationError("อุปกรณ์นี้เลิกใช้งานแล้ว", 409);
}

/** เทียบ version จากแถวที่ล็อกเพื่อหยุดคำขอเก่าก่อนเกิด insert หรือ CAS ใด ๆ */
function assertExpectedVersion(currentVersion: number, expectedVersion: number) {
  if (currentVersion !== expectedVersion)
    throw new EquipmentOperationError(
      "ข้อมูลอุปกรณ์มีการเปลี่ยนแปลง กรุณาโหลดใหม่",
      409,
      "STALE_VERSION",
    );
}

/** เลือกเฉพาะ master fields และคง explicit null ของ interval เพื่อแยกคำสั่งล้างออกจาก field ที่ละไว้ */
function getMasterChanges(input: UpdateEquipmentMasterInput) {
  const prohibitedKey = Object.keys(input).find(
    (key) => !masterInputKeys.has(key),
  );
  if (prohibitedKey)
    throw new EquipmentOperationError(
      `ฟิลด์ ${prohibitedKey} ไม่สามารถแก้ผ่านข้อมูลทะเบียนได้`,
    );

  const changes: EquipmentMutationChanges = {};
  if (input.code !== undefined) changes.code = input.code.trim().toUpperCase();
  if (input.name !== undefined) changes.name = input.name;
  if (input.category !== undefined) changes.category = input.category;
  if (input.location !== undefined) changes.location = input.location;
  if (input.serialNumber !== undefined)
    changes.serialNumber = input.serialNumber || null;
  if (input.purchaseDate !== undefined)
    changes.purchaseDate = input.purchaseDate || null;
  if (input.warrantyEndDate !== undefined)
    changes.warrantyEndDate = input.warrantyEndDate || null;
  if (input.maintenanceIntervalHours !== undefined)
    changes.maintenanceIntervalHours = input.maintenanceIntervalHours;
  if (input.nextMaintenanceDate !== undefined)
    changes.nextMaintenanceDate = input.nextMaintenanceDate || null;
  if (input.note !== undefined) changes.note = input.note || null;
  return changes;
}

/** ใช้ locked state ตรวจ lifecycle/version และกำหนดรอบชั่วโมงแรกหรือการล้างภายใน transaction เดียวกับ CAS */
export function createEquipmentMutationService(
  repository: EquipmentMutationRepository,
) {
  return {
    async updateEquipmentMaster(
      equipmentId: number,
      branchId: number,
      input: UpdateEquipmentMasterInput,
      tx: DbTransaction,
    ) {
      const changes = getMasterChanges(input);
      const current = await repository.lockEquipment(equipmentId, branchId, tx);
      assertMutableLifecycle(current.status);
      assertExpectedVersion(current.version, input.expectedVersion);
      // เริ่ม threshold เฉพาะเมื่อยังไม่มีกำหนดเดิม; การล้าง interval ต้องล้าง threshold ด้วยเพื่อหยุดการเตือน.
      if (changes.maintenanceIntervalHours === null) changes.nextMaintenanceHours = null;
      else if (changes.maintenanceIntervalHours !== undefined && current.nextMaintenanceHours === null)
        changes.nextMaintenanceHours = current.currentUsageHours + changes.maintenanceIntervalHours;
      /** ตรวจวันจากค่าที่จะมีผลจริงหลัง merge เพื่อให้ partial API update ทำ invariant เสียไม่ได้ */
      const effectivePurchaseDate =
        changes.purchaseDate !== undefined
          ? changes.purchaseDate
          : current.purchaseDate;
      const effectiveWarrantyEndDate =
        changes.warrantyEndDate !== undefined
          ? changes.warrantyEndDate
          : current.warrantyEndDate;
      if (
        effectivePurchaseDate &&
        effectiveWarrantyEndDate &&
        effectiveWarrantyEndDate < effectivePurchaseDate
      ) {
        throw new EquipmentOperationError(
          "วันสิ้นสุดประกันต้องไม่ก่อนวันที่ซื้อ",
        );
      }
      await repository.compareAndSetEquipment(
        equipmentId,
        branchId,
        input.expectedVersion,
        changes,
        tx,
      );
      return { equipmentId, version: input.expectedVersion + 1 };
    },

    /** ตรวจ version ก่อนมิเตอร์จาก locked state เพื่อแยก stale 409 ออกจากการลดมิเตอร์จริงที่ต้องเป็น 400 */
    async updateEquipmentOperation(
      equipmentId: number,
      branchId: number,
      input: UpdateEquipmentOperationInput,
      tx: DbTransaction,
    ) {
      const current = await repository.lockEquipment(equipmentId, branchId, tx);
      assertMutableLifecycle(current.status);
      assertExpectedVersion(current.version, input.expectedVersion);
      if (input.currentUsageHours < current.currentUsageHours)
        throw new EquipmentOperationError(
          "ชั่วโมงใช้งานใหม่ต้องไม่น้อยกว่าค่าปัจจุบัน",
        );
      await repository.compareAndSetEquipment(
        equipmentId,
        branchId,
        input.expectedVersion,
        {
          currentUsageHours: input.currentUsageHours,
          status: input.status,
        },
        tx,
      );
      return { equipmentId, version: input.expectedVersion + 1 };
    },

    /** RETIRED เป็นปลายทางถาวร จึงล็อกและตรวจซ้ำก่อนเก็บเวลา/เหตุผลพร้อมเพิ่ม version ครั้งเดียว */
    async retireEquipment(
      equipmentId: number,
      branchId: number,
      input: RetireEquipmentInput,
      retiredAt: Date,
      tx: DbTransaction,
    ) {
      const current = await repository.lockEquipment(equipmentId, branchId, tx);
      assertMutableLifecycle(current.status);
      const reason = input.reason.trim();
      if (reason.length < 2 || reason.length > 500)
        throw new EquipmentOperationError("กรุณาระบุเหตุผลการเลิกใช้งาน");
      assertExpectedVersion(current.version, input.expectedVersion);
      await repository.compareAndSetEquipment(
        equipmentId,
        branchId,
        input.expectedVersion,
        {
          status: "RETIRED",
          retiredAt,
          retiredReason: reason,
        },
        tx,
      );
      return { equipmentId, version: input.expectedVersion + 1 };
    },

    /** ล็อกและตรวจ lifecycle/version/meter ก่อน append แล้ว CAS เพื่อให้ประวัติ สถานะ และ version สำเร็จหรือ rollback พร้อมกัน */
    async recordMaintenance(
      equipmentId: number,
      branchId: number,
      input: MaintenanceInput,
      tx: DbTransaction,
    ) {
      const current = await repository.lockEquipment(equipmentId, branchId, tx);
      assertMutableLifecycle(current.status);
      assertExpectedVersion(current.version, input.expectedVersion);

      const serviceHours = input.usageHoursAtService ?? current.currentUsageHours;
      if (serviceHours < current.currentUsageHours)
        throw new EquipmentOperationError(
          "ชั่วโมง ณ วันที่บำรุงต้องไม่น้อยกว่าค่าปัจจุบัน",
        );
      if (input.status === "COMPLETED" && !input.completedDate)
        throw new EquipmentOperationError("งานที่เสร็จแล้วต้องระบุวันที่เสร็จ");

      const maintenanceId = await repository.insertMaintenance(
        {
          equipmentId,
          type: input.type,
          status: input.status,
          scheduledDate: input.scheduledDate,
          completedDate: input.completedDate || null,
          usageHoursAtService: serviceHours,
          cost: String(input.cost),
          technician: input.technician || null,
          note: input.note || null,
        },
        tx,
      );

      const changes: EquipmentMutationChanges =
        input.status === "SCHEDULED"
          ? {}
          : input.status === "IN_PROGRESS"
            ? { status: "MAINTENANCE" }
            : {
                status: "OPERATIONAL",
                currentUsageHours: serviceHours,
                lastMaintenanceDate: input.completedDate!,
                nextMaintenanceHours: current.maintenanceIntervalHours
                  ? serviceHours + current.maintenanceIntervalHours
                  : null,
                nextMaintenanceDate: input.nextMaintenanceDate || null,
              };
      await repository.compareAndSetEquipment(
        equipmentId,
        branchId,
        input.expectedVersion,
        changes,
        tx,
      );
      return {
        maintenanceId,
        equipmentVersion: input.expectedVersion + 1,
      };
    },
  };
}

const equipmentMutationService = createEquipmentMutationService(
  equipmentMutationRepository,
);

export async function updateEquipmentMaster(
  equipmentId: number,
  branchId: number,
  input: UpdateEquipmentMasterInput,
  tx: DbTransaction,
) {
  return equipmentMutationService.updateEquipmentMaster(
    equipmentId,
    branchId,
    input,
    tx,
  );
}

export async function updateEquipmentOperation(
  equipmentId: number,
  branchId: number,
  input: UpdateEquipmentOperationInput,
  tx: DbTransaction,
) {
  return equipmentMutationService.updateEquipmentOperation(
    equipmentId,
    branchId,
    input,
    tx,
  );
}

export async function retireEquipment(
  equipmentId: number,
  branchId: number,
  input: RetireEquipmentInput,
  retiredAt: Date,
  tx: DbTransaction,
) {
  return equipmentMutationService.retireEquipment(
    equipmentId,
    branchId,
    input,
    retiredAt,
    tx,
  );
}

/** ใช้ transaction ของ caller เท่านั้น เพื่อให้ maintenance, equipment CAS และ Audit commit หรือ rollback เป็นชุดเดียว */
export async function recordMaintenance(
  equipmentId: number,
  branchId: number,
  input: MaintenanceInput,
  tx: DbTransaction,
) {
  return equipmentMutationService.recordMaintenance(
    equipmentId,
    branchId,
    input,
    tx,
  );
}
