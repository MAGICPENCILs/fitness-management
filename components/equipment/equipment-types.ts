import type {
  EquipmentDashboardDto,
  EquipmentDashboardFilters,
} from "@/lib/equipment-service";
import type {
  EquipmentCategory,
  EquipmentStatus,
  MaintenanceState,
  MaintenanceStatus,
  MaintenanceType,
} from "@/lib/equipment-core";

export type EquipmentDashboardProps = EquipmentDashboardDto & {
  filters: EquipmentDashboardFilters;
  today: string;
  canManage: boolean;
};

export const categoryLabels: Record<EquipmentCategory, string> = {
  CARDIO: "คาร์ดิโอ",
  STRENGTH: "แมชชีนเวท",
  FREE_WEIGHT: "ฟรีเวท",
  ACCESSORY: "อุปกรณ์เสริม",
  OTHER: "อื่น ๆ",
};

export const equipmentStatusLabels: Record<EquipmentStatus, string> = {
  OPERATIONAL: "พร้อมใช้งาน",
  MAINTENANCE: "อยู่ระหว่างบำรุง",
  OUT_OF_SERVICE: "หยุดใช้งานชั่วคราว",
  RETIRED: "เลิกใช้งาน",
};

export const maintenanceStateLabels: Record<MaintenanceState, string> = {
  OVERDUE: "เกินกำหนด",
  DUE_SOON: "ใกล้ถึงกำหนด",
  SCHEDULED: "มีกำหนดบำรุง",
  NONE: "ยังไม่กำหนดรอบ",
};

export const maintenanceTypeLabels: Record<MaintenanceType, string> = {
  INSPECTION: "ตรวจสภาพ",
  PREVENTIVE: "บำรุงเชิงป้องกัน",
  REPAIR: "ซ่อมแซม",
};

export const maintenanceStatusLabels: Record<MaintenanceStatus, string> = {
  SCHEDULED: "นัดหมายแล้ว",
  IN_PROGRESS: "กำลังดำเนินการ",
  COMPLETED: "เสร็จสิ้น",
};

type FilterOverride = Partial<
  Record<
    | "search"
    | "status"
    | "category"
    | "maintenance"
    | "tab"
    | "page"
    | "historyPage"
    | "historyEquipmentId"
    | "historyType"
    | "historyStatus",
    string | number | null | undefined
  >
>;

/** สร้าง URL จาก allowlist เท่านั้น เพื่อคง deep link โดยไม่ส่ง pageSize หรือ query ภายในกลับไปยัง browser */
export function buildEquipmentHref(
  filters: EquipmentDashboardFilters,
  overrides: FilterOverride = {},
) {
  const values: FilterOverride = {
    search: filters.search || undefined,
    status: filters.status === "ALL" ? undefined : filters.status,
    category: filters.category === "ALL" ? undefined : filters.category,
    maintenance:
      filters.maintenance === "ALL" ? undefined : filters.maintenance,
    tab: filters.tab,
    page: filters.page,
    historyPage: filters.historyPage,
    historyEquipmentId: filters.historyEquipmentId || undefined,
    historyType:
      !filters.historyType || filters.historyType === "ALL"
        ? undefined
        : filters.historyType,
    historyStatus:
      !filters.historyStatus || filters.historyStatus === "ALL"
        ? undefined
        : filters.historyStatus,
    ...overrides,
  };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  return `/equipment?${params.toString()}`;
}
