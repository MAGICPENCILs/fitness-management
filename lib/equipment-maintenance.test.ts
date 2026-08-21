import type { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  type EquipmentState = {
    id: number;
    branchId: number;
    code: string;
    name: string;
    category: "CARDIO";
    location: string;
    serialNumber: string | null;
    status: "OPERATIONAL" | "MAINTENANCE" | "OUT_OF_SERVICE" | "RETIRED";
    retiredAt: Date | null;
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
    createdAt: Date | null;
    updatedAt: Date | null;
  };
  type State = {
    equipment: EquipmentState;
    maintenance: Array<Record<string, unknown>>;
    audits: Array<Record<string, unknown>>;
  };

  const initialEquipment = (): EquipmentState => ({
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
    version: 4,
    purchaseDate: null,
    warrantyEndDate: null,
    currentUsageHours: 500,
    maintenanceIntervalHours: 250,
    nextMaintenanceHours: 750,
    nextMaintenanceDate: "2026-09-01",
    lastMaintenanceDate: "2026-07-01",
    note: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  });
  const state: State = {
    equipment: initialEquipment(),
    maintenance: [],
    audits: [],
  };
  const locks: Array<{ strength: string; condition: unknown }> = [];
  const updates: Array<{ values: Record<string, unknown>; condition: unknown }> = [];
  const maintenanceInsertAttempts: Array<Record<string, unknown>> = [];
  let maintenanceInsertFailure: unknown;
  let affectedRows = 1;
  let failAudit = false;

  const cloneState = (): State => ({
    equipment: { ...state.equipment },
    maintenance: state.maintenance.map((row) => ({ ...row })),
    audits: state.audits.map((row) => ({ ...row })),
  });

  function tableName(table: unknown) {
    if (!table || typeof table !== "object") return "";
    const symbol = Object.getOwnPropertySymbols(table).find(
      (candidate) => candidate.description === "drizzle:Name",
    );
    return symbol ? String((table as Record<symbol, unknown>)[symbol]) : "";
  }

  function executor(working: State) {
    return {
      select: vi.fn(() => {
        let condition: unknown;
        const chain = {
          from: vi.fn(),
          where: vi.fn((value: unknown) => {
            condition = value;
            return chain;
          }),
          for: vi.fn((strength: string) => {
            locks.push({ strength, condition });
            return chain;
          }),
          limit: vi.fn(async () => [{ ...working.equipment }]),
        };
        chain.from.mockReturnValue(chain);
        return chain;
      }),
      insert: vi.fn((table: unknown) => ({
        values: vi.fn(async (values: Record<string, unknown>) => {
          if (tableName(table) === "maintenance_records") {
            maintenanceInsertAttempts.push({ ...values });
            if (maintenanceInsertFailure) throw maintenanceInsertFailure;
            working.maintenance.push({ id: 31, ...values });
            return [{ insertId: 31 }];
          }
          if (tableName(table) === "audit_logs") {
            if (failAudit) throw new Error("AUDIT_WRITE_FAILED");
            working.audits.push({ ...values });
            return [{ insertId: 99 }];
          }
          throw new Error(`UNEXPECTED_INSERT:${tableName(table)}`);
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn((values: Record<string, unknown>) => ({
          where: vi.fn(async (condition: unknown) => {
            updates.push({ values, condition });
            if (affectedRows === 1) {
              for (const [key, value] of Object.entries(values)) {
                if (key !== "version")
                  Object.assign(working.equipment, { [key]: value });
              }
              working.equipment.version += 1;
            }
            return [{ affectedRows }];
          }),
        })),
      })),
    };
  }

  const db = {
    transaction: vi.fn(
      async <T>(callback: (tx: ReturnType<typeof executor>) => Promise<T>) => {
        const working = cloneState();
        const result = await callback(executor(working));
        state.equipment = working.equipment;
        state.maintenance = working.maintenance;
        state.audits = working.audits;
        return result;
      },
    ),
    insert: vi.fn((table: unknown) => executor(state).insert(table)),
  };

  return {
    db,
    state,
    locks,
    updates,
    maintenanceInsertAttempts,
    directExecutor: () => executor(state),
    reset(overrides: Partial<EquipmentState> = {}) {
      state.equipment = { ...initialEquipment(), ...overrides };
      state.maintenance = [];
      state.audits = [];
      locks.length = 0;
      updates.length = 0;
      maintenanceInsertAttempts.length = 0;
      maintenanceInsertFailure = undefined;
      affectedRows = 1;
      failAudit = false;
      vi.clearAllMocks();
    },
    failMaintenanceInsert(error: unknown) {
      maintenanceInsertFailure = error;
    },
    setAffectedRows(value: number) {
      affectedRows = value;
    },
    setFailAudit(value: boolean) {
      failAudit = value;
    },
  };
});

vi.mock("@/db", () => ({ db: database.db }));

import { runAuditedMutation, type DbTransaction } from "@/lib/audit-service";
import { equipmentMutationRepository } from "@/lib/equipment-repository";
import { createEquipmentMutationService } from "@/lib/equipment-service";

const service = createEquipmentMutationService(equipmentMutationRepository);

function input(
  overrides: Record<string, unknown> = {},
) {
  return {
    type: "REPAIR" as const,
    status: "COMPLETED" as const,
    scheduledDate: "2026-08-21",
    completedDate: "2026-08-21",
    usageHoursAtService: 550,
    cost: 1200,
    expectedVersion: 4,
    ...overrides,
  };
}

function successfulAuditCount() {
  return database.state.audits.filter((entry) => entry.result === "SUCCESS")
    .length;
}

async function recordAudited(overrides: Record<string, unknown> = {}) {
  return runAuditedMutation(
    {
      actorStaffId: 2,
      branchId: 10,
      action: "MAINTENANCE_RECORDED",
      entityType: "MAINTENANCE",
      success: (value: { maintenanceId: number }) => ({
        entityId: value.maintenanceId,
      }),
    },
    (tx) => service.recordMaintenance(7, 10, input(overrides), tx),
  );
}

function renderCondition(condition: unknown) {
  return new MySqlDialect().sqlToQuery((condition as { getSQL(): SQL }).getSQL());
}

describe("atomic equipment maintenance", () => {
  beforeEach(() => database.reset());

  it("SCHEDULED เพิ่มประวัติ/version ครั้งเดียวโดยคงสถานะ มิเตอร์ และวันบำรุงเดิม", async () => {
    const tx = database.directExecutor() as unknown as DbTransaction;

    await expect(
      service.recordMaintenance(
        7,
        10,
        input({
          status: "SCHEDULED",
          completedDate: undefined,
          usageHoursAtService: 525,
        }),
        tx,
      ),
    ).resolves.toEqual({ maintenanceId: 31, equipmentVersion: 5 });

    expect(database.state.maintenance).toHaveLength(1);
    expect(database.state.equipment).toMatchObject({
      status: "OPERATIONAL",
      currentUsageHours: 500,
      lastMaintenanceDate: "2026-07-01",
      nextMaintenanceHours: 750,
      nextMaintenanceDate: "2026-09-01",
      version: 5,
    });
    expect(database.db.transaction).not.toHaveBeenCalled();
    expect(database.locks).toHaveLength(1);
    const lockQuery = renderCondition(database.locks[0]?.condition);
    expect(lockQuery.params).toEqual([7, 10]);
    const updateQuery = renderCondition(database.updates[0]?.condition);
    expect(updateQuery.params).toEqual([7, 10, 4]);
  });

  it("IN_PROGRESS ตั้ง MAINTENANCE แต่คงมิเตอร์และกำหนดเดิม", async () => {
    await expect(
      service.recordMaintenance(
        7,
        10,
        input({
          status: "IN_PROGRESS",
          completedDate: undefined,
          usageHoursAtService: 525,
        }),
        database.directExecutor() as unknown as DbTransaction,
      ),
    ).resolves.toEqual({ maintenanceId: 31, equipmentVersion: 5 });

    expect(database.state.equipment).toMatchObject({
      status: "MAINTENANCE",
      currentUsageHours: 500,
      lastMaintenanceDate: "2026-07-01",
      nextMaintenanceHours: 750,
      nextMaintenanceDate: "2026-09-01",
      version: 5,
    });
  });

  it.each([
    [undefined, null],
    ["2026-10-21", "2026-10-21"],
  ])(
    "COMPLETED คืน id/version และตั้งวันรอบถัดไปจาก input %s ภายใน audited transaction เดียว",
    async (nextMaintenanceDate, expectedNextDate) => {
      await expect(
        recordAudited({ nextMaintenanceDate }),
      ).resolves.toEqual({
        maintenanceId: 31,
        equipmentVersion: 5,
      });

      expect(database.state.equipment).toMatchObject({
        status: "OPERATIONAL",
        currentUsageHours: 550,
        lastMaintenanceDate: "2026-08-21",
        nextMaintenanceHours: 800,
        nextMaintenanceDate: expectedNextDate,
        version: 5,
      });
      expect(database.state.maintenance[0]).toMatchObject({
        id: 31,
        equipmentId: 7,
        usageHoursAtService: 550,
        cost: "1200",
      });
      expect(successfulAuditCount()).toBe(1);
      expect(database.db.transaction).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["RETIRED", { status: "RETIRED" }, {}, 409],
    ["stale version", {}, { expectedVersion: 3 }, 409],
    ["decreasing meter", {}, { usageHoursAtService: 499 }, 400],
  ])("ปฏิเสธ %s ก่อน insert/CAS และไม่มี SUCCESS Audit", async (_label, row, request, status) => {
    database.reset(row as never);

    await expect(recordAudited(request)).rejects.toMatchObject({ status });

    expect(database.maintenanceInsertAttempts).toEqual([]);
    expect(database.updates).toEqual([]);
    expect(database.state.maintenance).toEqual([]);
    expect(database.state.equipment.version).toBe(4);
    expect(successfulAuditCount()).toBe(0);
    expect(database.state.audits).toHaveLength(1);
    expect(database.state.audits[0]).toMatchObject({ result: "FAILED" });
  });

  it("maintenance insert ล้มแล้ว rollback โดยไม่เปลี่ยนอุปกรณ์หรือ SUCCESS Audit", async () => {
    database.failMaintenanceInsert(new Error("MAINTENANCE_INSERT_FAILED"));

    await expect(recordAudited()).rejects.toThrow("MAINTENANCE_INSERT_FAILED");

    expect(database.state.maintenance).toEqual([]);
    expect(database.state.equipment).toMatchObject({
      status: "OPERATIONAL",
      currentUsageHours: 500,
      version: 4,
    });
    expect(successfulAuditCount()).toBe(0);
  });

  it("CAS affectedRows ไม่เท่ากับหนึ่งแล้ว rollback maintenance และ equipment", async () => {
    database.setAffectedRows(0);

    await expect(recordAudited()).rejects.toMatchObject({ status: 409 });

    expect(database.maintenanceInsertAttempts).toHaveLength(1);
    expect(database.state.maintenance).toEqual([]);
    expect(database.state.equipment).toMatchObject({
      status: "OPERATIONAL",
      currentUsageHours: 500,
      version: 4,
    });
    expect(successfulAuditCount()).toBe(0);
  });

  it("SUCCESS Audit ล้มแล้ว rollback maintenance และ equipment/version", async () => {
    database.setFailAudit(true);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(recordAudited()).rejects.toThrow("AUDIT_WRITE_FAILED");

    expect(database.state.maintenance).toEqual([]);
    expect(database.state.equipment).toMatchObject({
      status: "OPERATIONAL",
      currentUsageHours: 500,
      version: 4,
    });
    expect(database.state.audits).toEqual([]);
    consoleError.mockRestore();
  });
});
