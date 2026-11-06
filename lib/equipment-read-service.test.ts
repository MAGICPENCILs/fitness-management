import { describe, expect, it } from "vitest";
import type {
  EquipmentListQuery,
  EquipmentReadRepository,
  EquipmentRow,
  EquipmentSummaryRow,
  MaintenanceListQuery,
  MaintenanceRow,
} from "@/lib/equipment-repository";
import {
  EquipmentOperationError,
  createEquipmentReadService,
  parseEquipmentDashboardFilters,
} from "@/lib/equipment-service";

const summaryRow: EquipmentSummaryRow = {
  total: 90,
  operational: 52,
  maintenance: 12,
  outOfService: 9,
  retired: 17,
  overdue: 8,
  dueSoon: 11,
};

// ใช้แถวที่มีทุก field จากฐานข้อมูลเพื่อให้ test ตรวจการแปลง DTO ไม่หลบ Date หรือ Decimal ที่ UI รับไม่ได้
function makeEquipmentRow(overrides: Partial<EquipmentRow> = {}): EquipmentRow {
  return {
    id: 7,
    branchId: 10,
    code: "BIKE-007",
    name: "Spin Bike",
    category: "CARDIO",
    location: "Zone A",
    serialNumber: "SN-007",
    status: "OPERATIONAL",
    retiredAt: null,
    retiredReason: null,
    version: 3,
    purchaseDate: "2025-01-10",
    warrantyEndDate: "2027-01-10",
    currentUsageHours: 100,
    maintenanceIntervalHours: 200,
    nextMaintenanceHours: 150,
    nextMaintenanceDate: "2026-08-25",
    lastMaintenanceDate: "2026-01-10",
    note: "ready",
    createdAt: new Date("2026-01-01T02:00:00.000Z"),
    updatedAt: new Date("2026-08-20T03:00:00.000Z"),
    ...overrides,
  };
}

// จำลองผล join เต็มรูปแบบเพื่อยืนยันว่า service แปลง decimal cost และ timestamp ก่อนข้าม Server Component boundary
function makeMaintenanceRow(
  overrides: Partial<MaintenanceRow> = {},
): MaintenanceRow {
  return {
    id: 80,
    equipmentId: 7,
    equipmentCode: "BIKE-007",
    equipmentName: "Spin Bike",
    type: "PREVENTIVE",
    status: "COMPLETED",
    scheduledDate: "2026-08-20",
    completedDate: "2026-08-21",
    usageHoursAtService: 100,
    cost: "1250.50",
    technician: "Somchai",
    note: "belt adjusted",
    createdAt: new Date("2026-08-21T04:30:00.000Z"),
    ...overrides,
  };
}

class FakeEquipmentReadRepository implements EquipmentReadRepository {
  lastSummaryInput: { branchId: number; today: string } | null = null;
  lastListInput: EquipmentListQuery | null = null;
  lastMaintenanceInput: MaintenanceListQuery | null = null;
  lastDetailInput: { branchId: number; equipmentId: number } | null = null;
  equipmentRows = [makeEquipmentRow()];
  equipmentTotal = 43;
  maintenanceRows = [makeMaintenanceRow()];
  maintenanceTotal = 101;
  detailRow: EquipmentRow | null = makeEquipmentRow();

  async getSummary(branchId: number, today: string) {
    this.lastSummaryInput = { branchId, today };
    return summaryRow;
  }

  async listEquipment(input: EquipmentListQuery) {
    this.lastListInput = input;
    return { rows: this.equipmentRows, total: this.equipmentTotal };
  }

  async listMaintenance(input: MaintenanceListQuery) {
    this.lastMaintenanceInput = input;
    return { rows: this.maintenanceRows, total: this.maintenanceTotal };
  }

  async findEquipmentDetail(branchId: number, equipmentId: number) {
    this.lastDetailInput = { branchId, equipmentId };
    if (
      !this.detailRow ||
      this.detailRow.branchId !== branchId ||
      this.detailRow.id !== equipmentId
    )
      return null;
    return this.detailRow;
  }
}

describe("equipment read service", () => {
  it("แยก summary ทั้งสาขาจากผลอุปกรณ์ที่กรองและแบ่งหน้าใน SQL", async () => {
    const repo = new FakeEquipmentReadRepository();
    const service = createEquipmentReadService(repo);

    const result = await service.getEquipmentDashboard("2026-08-21", 10, {
      search: "BIKE",
      status: "OPERATIONAL",
      category: "CARDIO",
      maintenance: "DUE_SOON",
      tab: "equipment",
      page: 2,
      historyPage: 1,
      pageSize: 20,
    });

    expect(repo.lastSummaryInput).toEqual({ branchId: 10, today: "2026-08-21" });
    expect(repo.lastListInput).toEqual({
      branchId: 10,
      today: "2026-08-21",
      search: "BIKE",
      status: "OPERATIONAL",
      category: "CARDIO",
      maintenance: "DUE_SOON",
      limit: 20,
      offset: 20,
    });
    expect(result.equipmentPagination).toEqual({
      page: 2,
      pageSize: 20,
      total: 43,
      totalPages: 3,
    });
    expect(result.summary.total).toBe(90);
  });

  it("ส่ง filter ประวัติครบและเลื่อนไปหน้าที่เกิน hard cap เดิม 50 รายการ", async () => {
    const repo = new FakeEquipmentReadRepository();
    const service = createEquipmentReadService(repo);

    const result = await service.getEquipmentDashboard("2026-08-21", 10, {
      search: "",
      status: "ALL",
      category: "ALL",
      maintenance: "ALL",
      tab: "history",
      page: 1,
      historyPage: 4,
      pageSize: 20,
      historyEquipmentId: 7,
      historyType: "REPAIR",
      historyStatus: "COMPLETED",
    });

    expect(repo.lastMaintenanceInput).toEqual({
      branchId: 10,
      equipmentId: 7,
      type: "REPAIR",
      status: "COMPLETED",
      limit: 20,
      offset: 60,
    });
    expect(result.historyPagination).toEqual({
      page: 4,
      pageSize: 20,
      total: 101,
      totalPages: 6,
    });
  });

  it("แปลง Date และ Decimal ทุกค่าที่คืนจาก repository เป็น DTO ที่ serialize ได้", async () => {
    const repo = new FakeEquipmentReadRepository();
    repo.equipmentRows = [
      makeEquipmentRow({ retiredAt: new Date("2026-08-01T01:00:00.000Z") }),
    ];
    const service = createEquipmentReadService(repo);

    const result = await service.getEquipmentDashboard("2026-08-21", 10, {
      search: "",
      status: "ALL",
      category: "ALL",
      maintenance: "ALL",
      tab: "equipment",
      page: 1,
      historyPage: 1,
      pageSize: 20,
    });

    expect(result.equipment[0]).toMatchObject({
      retiredAt: "2026-08-01T01:00:00.000Z",
      createdAt: "2026-01-01T02:00:00.000Z",
      updatedAt: "2026-08-20T03:00:00.000Z",
      maintenanceState: "DUE_SOON",
    });
    expect(result.history[0]).toMatchObject({
      cost: 1250.5,
      createdAt: "2026-08-21T04:30:00.000Z",
    });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("ไม่ส่งสถานะเร่งด่วนหรือค่าคงเหลือของอุปกรณ์ที่เลิกใช้งานแล้ว", async () => {
    const repo = new FakeEquipmentReadRepository();
    repo.equipmentRows = [
      makeEquipmentRow({
        status: "RETIRED",
        nextMaintenanceHours: 50,
        nextMaintenanceDate: "2026-08-01",
      }),
    ];
    const service = createEquipmentReadService(repo);

    const result = await service.getEquipmentDashboard("2026-08-21", 10, {
      search: "",
      status: "RETIRED",
      category: "ALL",
      maintenance: "ALL",
      tab: "equipment",
      page: 1,
      historyPage: 1,
      pageSize: 20,
    });

    expect(result.equipment[0]).toMatchObject({
      status: "RETIRED",
      maintenanceState: "NONE",
      remainingHours: null,
      remainingDays: null,
    });
  });

  it("ค้น detail ด้วย branch และ id พร้อมแบ่งประวัติของอุปกรณ์โดยเฉพาะ", async () => {
    const repo = new FakeEquipmentReadRepository();
    const service = createEquipmentReadService(repo);

    const result = await service.getEquipmentDetail("2026-08-21", 10, 7, 3);

    expect(repo.lastDetailInput).toEqual({ branchId: 10, equipmentId: 7 });
    expect(repo.lastMaintenanceInput).toEqual({
      branchId: 10,
      equipmentId: 7,
      type: "ALL",
      status: "ALL",
      limit: 20,
      offset: 40,
    });
    expect(result.historyPagination).toEqual({
      page: 3,
      pageSize: 20,
      total: 101,
      totalPages: 6,
    });
    expect(result.equipment.id).toBe(7);
  });

  it("ตอบ 404 แบบเดียวกันเมื่อไม่พบ id หรืออุปกรณ์อยู่อีกสาขา", async () => {
    const repo = new FakeEquipmentReadRepository();
    const service = createEquipmentReadService(repo);

    await expect(
      service.getEquipmentDetail("2026-08-21", 10, 999, 1),
    ).rejects.toMatchObject({
      message: "ไม่พบอุปกรณ์",
      status: 404,
    } satisfies Partial<EquipmentOperationError>);
    await expect(
      service.getEquipmentDetail("2026-08-21", 11, 7, 1),
    ).rejects.toMatchObject({
      message: "ไม่พบอุปกรณ์",
      status: 404,
    } satisfies Partial<EquipmentOperationError>);
  });

  it("รับเฉพาะ search params ค่าเดี่ยวและคืนค่า default เฉพาะ field ที่ไม่ปลอดภัย", () => {
    expect(
      parseEquipmentDashboardFilters({
        search: "  bike  ",
        status: "OPERATIONAL",
        category: ["CARDIO", "OTHER"],
        maintenance: "INVALID",
        tab: "history",
        page: "0",
        historyPage: "4",
        pageSize: "999",
        historyEquipmentId: "7",
        historyType: "REPAIR",
        historyStatus: "COMPLETED",
      }),
    ).toEqual({
      search: "bike",
      status: "OPERATIONAL",
      category: "ALL",
      maintenance: "ALL",
      tab: "history",
      page: 1,
      historyPage: 4,
      pageSize: 20,
      historyEquipmentId: 7,
      historyType: "REPAIR",
      historyStatus: "COMPLETED",
    });
  });
});
