import { describe, expect, it, vi } from "vitest";
import type { DbTransaction } from "@/lib/audit-service";
import type { EquipmentRow } from "@/lib/equipment-repository";
import * as equipmentServiceModule from "@/lib/equipment-service";

type MutationRepository = {
  lockEquipment: (
    equipmentId: number,
    branchId: number,
    tx: DbTransaction,
  ) => Promise<EquipmentRow>;
  compareAndSetEquipment: (
    equipmentId: number,
    branchId: number,
    expectedVersion: number,
    changes: Record<string, unknown>,
    tx: DbTransaction,
  ) => Promise<void>;
};

type MutationService = {
  updateEquipmentMaster: (
    equipmentId: number,
    branchId: number,
    input: Record<string, unknown>,
    tx: DbTransaction,
  ) => Promise<{ equipmentId: number; version: number }>;
  updateEquipmentOperation: (
    equipmentId: number,
    branchId: number,
    input: {
      currentUsageHours: number;
      status: "OPERATIONAL" | "MAINTENANCE" | "OUT_OF_SERVICE";
      expectedVersion: number;
    },
    tx: DbTransaction,
  ) => Promise<{ equipmentId: number; version: number }>;
  retireEquipment: (
    equipmentId: number,
    branchId: number,
    input: { reason: string; expectedVersion: number },
    retiredAt: Date,
    tx: DbTransaction,
  ) => Promise<{ equipmentId: number; version: number }>;
};

const createEquipmentMutationService = (
  equipmentServiceModule as unknown as {
    createEquipmentMutationService: (
      repository: MutationRepository,
    ) => MutationService;
  }
).createEquipmentMutationService;

const tx = { transactionMarker: "caller-owned" } as unknown as DbTransaction;
const NOW = new Date("2026-08-21T05:00:00.000Z");

function makeEquipmentRow(
  overrides: Partial<EquipmentRow> = {},
): EquipmentRow {
  return {
    id: 7,
    branchId: 10,
    code: "BIKE-01",
    name: "Bike 01",
    category: "CARDIO",
    location: "Floor 1",
    serialNumber: null,
    status: "OPERATIONAL",
    retiredAt: null,
    retiredReason: null,
    version: 3,
    purchaseDate: null,
    warrantyEndDate: null,
    currentUsageHours: 100,
    maintenanceIntervalHours: 250,
    nextMaintenanceHours: 350,
    nextMaintenanceDate: null,
    lastMaintenanceDate: null,
    note: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createHarness(row = makeEquipmentRow()) {
  const repository: MutationRepository = {
    lockEquipment: vi.fn(async () => row),
    compareAndSetEquipment: vi.fn(async () => undefined),
  };
  return {
    repository,
    service: createEquipmentMutationService(repository),
  };
}

describe("equipment mutation service", () => {
  it.each([
    [
      "แก้เฉพาะวันซื้อ",
      { purchaseDate: "2026-02-01", expectedVersion: 3 },
      { warrantyEndDate: "2026-01-31" },
    ],
    [
      "แก้เฉพาะวันสิ้นสุดประกัน",
      { warrantyEndDate: "2026-01-31", expectedVersion: 3 },
      { purchaseDate: "2026-02-01" },
    ],
  ])("ปฏิเสธ invariant วันที่จากค่าปัจจุบันเมื่อ%s", async (_label, input, current) => {
    const { repository, service } = createHarness(makeEquipmentRow(current));

    await expect(
      service.updateEquipmentMaster(7, 10, input, tx),
    ).rejects.toMatchObject({ status: 400 });
    expect(repository.compareAndSetEquipment).not.toHaveBeenCalled();
  });

  it.each([
    [
      "ล้างวันซื้อ",
      { purchaseDate: "", expectedVersion: 3 },
      { purchaseDate: "2026-02-01", warrantyEndDate: "2026-01-31" },
      { purchaseDate: null },
    ],
    [
      "ขยับวันสิ้นสุดประกัน",
      { warrantyEndDate: "2026-02-02", expectedVersion: 3 },
      { purchaseDate: "2026-02-01", warrantyEndDate: "2026-01-31" },
      { warrantyEndDate: "2026-02-02" },
    ],
  ])("ยอมรับ invariant ที่ถูกต้องเมื่อ%s", async (_label, input, current, changes) => {
    const { repository, service } = createHarness(makeEquipmentRow(current));

    await expect(
      service.updateEquipmentMaster(7, 10, input, tx),
    ).resolves.toEqual({ equipmentId: 7, version: 4 });
    expect(repository.compareAndSetEquipment).toHaveBeenCalledWith(
      7,
      10,
      3,
      changes,
      tx,
    );
  });

  it("ปฏิเสธมิเตอร์ที่ลดลงก่อนเรียก compare-and-set", async () => {
    const { repository, service } = createHarness();

    await expect(
      service.updateEquipmentOperation(
        7,
        10,
        {
          currentUsageHours: 99,
          status: "OPERATIONAL",
          expectedVersion: 3,
        },
        tx,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(repository.compareAndSetEquipment).not.toHaveBeenCalled();
  });

  it("ส่ง expectedVersion เดิมและคืน version ที่เพิ่มหนึ่งเมื่อเลิกใช้งาน", async () => {
    const { repository, service } = createHarness();

    await expect(
      service.retireEquipment(
        7,
        10,
        { reason: "ชำรุดถาวร", expectedVersion: 3 },
        NOW,
        tx,
      ),
    ).resolves.toEqual({ equipmentId: 7, version: 4 });
    expect(repository.compareAndSetEquipment).toHaveBeenCalledWith(
      7,
      10,
      3,
      {
        status: "RETIRED",
        retiredAt: NOW,
        retiredReason: "ชำรุดถาวร",
      },
      tx,
    );
  });

  it("ปฏิเสธเหตุผลเลิกใช้งานที่ว่างหลัง trim ก่อนเขียนข้อมูล", async () => {
    const { repository, service } = createHarness();

    await expect(
      service.retireEquipment(
        7,
        10,
        { reason: "   ", expectedVersion: 3 },
        NOW,
        tx,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(repository.compareAndSetEquipment).not.toHaveBeenCalled();
  });

  it("ปฏิเสธ expectedVersion เก่าก่อนเขียนข้อมูล", async () => {
    const { repository, service } = createHarness(
      makeEquipmentRow({ version: 4 }),
    );

    await expect(
      service.updateEquipmentOperation(
        7,
        10,
        {
          currentUsageHours: 101,
          status: "OPERATIONAL",
          expectedVersion: 3,
        },
        tx,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(repository.compareAndSetEquipment).not.toHaveBeenCalled();
  });

  it.each(["updateEquipmentMaster", "updateEquipmentOperation", "retireEquipment"] as const)(
    "ทำให้ RETIRED เป็นสถานะปลายทางสำหรับ %s",
    async (method) => {
      const { repository, service } = createHarness(
        makeEquipmentRow({
          status: "RETIRED",
          retiredAt: NOW,
          retiredReason: "ชำรุดถาวร",
        }),
      );
      const invocation =
        method === "updateEquipmentMaster"
          ? service.updateEquipmentMaster(
              7,
              10,
              { name: "Bike 02", expectedVersion: 3 },
              tx,
            )
          : method === "updateEquipmentOperation"
            ? service.updateEquipmentOperation(
                7,
                10,
                {
                  currentUsageHours: 100,
                  status: "OPERATIONAL",
                  expectedVersion: 3,
                },
                tx,
              )
            : service.retireEquipment(
                7,
                10,
                { reason: "เลิกใช้อีกครั้ง", expectedVersion: 3 },
                NOW,
                tx,
              );

      await expect(invocation).rejects.toMatchObject({ status: 409 });
      expect(repository.compareAndSetEquipment).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["branchId", 99],
    ["currentUsageHours", 101],
    ["status", "MAINTENANCE"],
    ["retiredAt", NOW],
    ["retiredReason", "เหตุผล"],
  ])("ปฏิเสธ master field %s ที่ต้องใช้ workflow อื่น", async (field, value) => {
    const { repository, service } = createHarness();

    await expect(
      service.updateEquipmentMaster(
        7,
        10,
        { name: "Bike 02", expectedVersion: 3, [field]: value },
        tx,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(repository.compareAndSetEquipment).not.toHaveBeenCalled();
  });

  it("ทำ normalized code ก่อนส่ง repository และคง transaction ของ caller", async () => {
    const { repository, service } = createHarness();

    await expect(
      service.updateEquipmentMaster(
        7,
        10,
        { code: " bike-02 ", expectedVersion: 3 },
        tx,
      ),
    ).resolves.toEqual({ equipmentId: 7, version: 4 });
    expect(repository.lockEquipment).toHaveBeenCalledWith(7, 10, tx);
    expect(repository.compareAndSetEquipment).toHaveBeenCalledWith(
      7,
      10,
      3,
      { code: "BIKE-02" },
      tx,
    );
  });
});
