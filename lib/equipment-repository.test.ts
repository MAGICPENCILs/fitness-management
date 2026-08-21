import type { SQL } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
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
    audits: Array<Record<string, unknown>>;
  };

  const initialRow = (): EquipmentState => ({
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
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  });
  const state: State = { equipment: initialRow(), audits: [] };
  const locks: Array<{ strength: string; condition: unknown }> = [];
  const updates: Array<{ values: Record<string, unknown>; condition: unknown }> = [];
  const inserts: Array<Record<string, unknown>> = [];
  let affectedRowsOverride: number | null = null;
  let updateFailure: unknown;
  let insertFailure: unknown;
  let failAudit = false;
  let rowVisible = true;

  const cloneState = (): State => ({
    equipment: { ...state.equipment },
    audits: state.audits.map((row) => ({ ...row })),
  });

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
          limit: vi.fn(async () =>
            rowVisible ? [{ ...working.equipment }] : [],
          ),
        };
        chain.from.mockReturnValue(chain);
        return chain;
      }),
      update: vi.fn(() => ({
        set: vi.fn((values: Record<string, unknown>) => ({
          where: vi.fn(async (condition: unknown) => {
            updates.push({ values, condition });
            if (updateFailure) throw updateFailure;
            const affectedRows = affectedRowsOverride ?? 1;
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
      insert: vi.fn(() => ({
        values: vi.fn(async (values: Record<string, unknown>) => {
          inserts.push({ ...values });
          if (insertFailure) throw insertFailure;
          if (failAudit) throw new Error("AUDIT_WRITE_FAILED");
          working.audits.push({ ...values });
          return [{ insertId: 99 }];
        }),
      })),
    };
  }

  const db = {
    transaction: vi.fn(
      async <T>(
        callback: (tx: ReturnType<typeof executor>) => Promise<T>,
      ) => {
        const working = cloneState();
        const result = await callback(executor(working));
        state.equipment = working.equipment;
        state.audits = working.audits;
        return result;
      },
    ),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        if (failAudit) throw new Error("AUDIT_WRITE_FAILED");
        state.audits.push({ ...values });
      }),
    })),
  };

  return {
    db,
    state,
    locks,
    updates,
    inserts,
    directExecutor: () => executor(state),
    reset(overrides: Partial<EquipmentState> = {}) {
      state.equipment = { ...initialRow(), ...overrides };
      state.audits = [];
      locks.length = 0;
      updates.length = 0;
      inserts.length = 0;
      affectedRowsOverride = null;
      updateFailure = undefined;
      insertFailure = undefined;
      failAudit = false;
      rowVisible = true;
      vi.clearAllMocks();
    },
    setAffectedRows(value: number) {
      affectedRowsOverride = value;
    },
    setUpdateFailure(value: unknown) {
      updateFailure = value;
    },
    setInsertFailure(value: unknown) {
      insertFailure = value;
    },
    setFailAudit(value: boolean) {
      failAudit = value;
    },
    setRowVisible(value: boolean) {
      rowVisible = value;
    },
  };
});

vi.mock("@/db", () => ({ db: database.db }));

import { runAuditedMutation, type DbTransaction } from "@/lib/audit-service";
import * as repositoryModule from "@/lib/equipment-repository";
import * as serviceModule from "@/lib/equipment-service";

type ProductionRepository = {
  lockEquipment: (
    equipmentId: number,
    branchId: number,
    tx: DbTransaction,
  ) => Promise<unknown>;
  compareAndSetEquipment: (
    equipmentId: number,
    branchId: number,
    expectedVersion: number,
    changes: Record<string, unknown>,
    tx: DbTransaction,
  ) => Promise<void>;
};

const equipmentMutationRepository = (
  repositoryModule as unknown as {
    equipmentMutationRepository: ProductionRepository;
  }
).equipmentMutationRepository;
const createEquipmentMutationService = (
  serviceModule as unknown as {
    createEquipmentMutationService: (
      repository: ProductionRepository,
    ) => {
      updateEquipmentMaster: (...args: unknown[]) => Promise<unknown>;
      updateEquipmentOperation: (...args: unknown[]) => Promise<unknown>;
      retireEquipment: (...args: unknown[]) => Promise<unknown>;
    };
  }
).createEquipmentMutationService;

function renderCondition(condition: unknown) {
  return new MySqlDialect().sqlToQuery((condition as { getSQL(): SQL }).getSQL());
}

function makeDriverDuplicateError(constraint: string) {
  return Object.assign(
    new Error(`Duplicate entry 'BIKE-02' for key \`${constraint}\``),
    {
      code: "ER_DUP_ENTRY",
      errno: 1062,
      sqlMessage: `Duplicate entry 'BIKE-02' for key 'fitness.${constraint}'`,
    },
  );
}

function makeWrappedDuplicateError(constraint: string) {
  return new DrizzleQueryError(
    "update `equipment` set `code` = ? where `id` = ?",
    ["BIKE-02", 7],
    makeDriverDuplicateError(constraint),
  );
}

function makeDuplicateErrorForKey(keyReference: string, wrapped: boolean) {
  const driverError = Object.assign(
    new Error(`Duplicate entry 'BIKE-02' for key ${keyReference}`),
    {
      code: "ER_DUP_ENTRY",
      errno: 1062,
      sqlMessage: `Duplicate entry 'BIKE-02' for key ${keyReference}`,
    },
  );
  return wrapped
    ? new DrizzleQueryError("insert into `equipment` values (?)", [], driverError)
    : driverError;
}

describe("production equipment mutation repository", () => {
  beforeEach(() => database.reset());

  it("ล็อกด้วย id และ branch ก่อน CAS ที่ version เดิมและเพิ่ม version หนึ่ง", async () => {
    const service = createEquipmentMutationService(equipmentMutationRepository);
    const tx = database.directExecutor() as unknown as DbTransaction;

    await expect(
      service.updateEquipmentOperation(
        7,
        10,
        {
          currentUsageHours: 125,
          status: "MAINTENANCE",
          expectedVersion: 3,
        },
        tx,
      ),
    ).resolves.toEqual({ equipmentId: 7, version: 4 });

    expect(database.locks).toHaveLength(1);
    expect(database.locks[0]?.strength).toBe("update");
    const lockQuery = renderCondition(database.locks[0]?.condition);
    expect(lockQuery.sql).toMatch(/`equipment`\.`id` = \?/);
    expect(lockQuery.sql).toMatch(/`equipment`\.`branch_id` = \?/);
    expect(lockQuery.params).toEqual([7, 10]);

    expect(database.updates).toHaveLength(1);
    const updateQuery = renderCondition(database.updates[0]?.condition);
    expect(updateQuery.sql).toMatch(/`equipment`\.`id` = \?/);
    expect(updateQuery.sql).toMatch(/`equipment`\.`branch_id` = \?/);
    expect(updateQuery.sql).toMatch(/`equipment`\.`version` = \?/);
    expect(updateQuery.params).toEqual([7, 10, 3]);
    const versionExpression = database.updates[0]?.values.version as {
      getSQL(): SQL;
    };
    const versionQuery = new MySqlDialect().sqlToQuery(versionExpression.getSQL());
    expect(versionQuery.sql).toMatch(/`equipment`\.`version` \+ \?/);
    expect(versionQuery.params).toEqual([1]);
    expect(database.state.equipment).toMatchObject({
      currentUsageHours: 125,
      status: "MAINTENANCE",
      version: 4,
    });
    expect(database.db.transaction).not.toHaveBeenCalled();
  });

  it("version เก่าหยุดก่อน UPDATE และไม่เปลี่ยน state", async () => {
    database.reset({ version: 4 });
    const service = createEquipmentMutationService(equipmentMutationRepository);

    await expect(
      service.updateEquipmentOperation(
        7,
        10,
        {
          currentUsageHours: 125,
          status: "MAINTENANCE",
          expectedVersion: 3,
        },
        database.directExecutor() as unknown as DbTransaction,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(database.updates).toEqual([]);
    expect(database.state.equipment).toMatchObject({
      currentUsageHours: 100,
      status: "OPERATIONAL",
      version: 4,
    });
    expect(database.state.audits).toEqual([]);
  });

  it("ไม่พบ id ใน branch ที่ล็อกแล้วคืน 404 โดยไม่ UPDATE", async () => {
    database.setRowVisible(false);
    const service = createEquipmentMutationService(equipmentMutationRepository);

    await expect(
      service.updateEquipmentOperation(
        7,
        10,
        {
          currentUsageHours: 125,
          status: "MAINTENANCE",
          expectedVersion: 3,
        },
        database.directExecutor() as unknown as DbTransaction,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(database.updates).toEqual([]);
  });

  it("stale mutation ผ่าน audited transaction ไม่มี equipment write หรือ SUCCESS Audit", async () => {
    database.reset({ version: 4 });
    const service = createEquipmentMutationService(equipmentMutationRepository);

    await expect(
      runAuditedMutation(
        {
          actorStaffId: 2,
          branchId: 10,
          action: "EQUIPMENT_OPERATION_UPDATED",
          entityType: "EQUIPMENT",
          success: () => ({ entityId: 7 }),
        },
        (tx) =>
          service.updateEquipmentOperation(
            7,
            10,
            {
              currentUsageHours: 125,
              status: "MAINTENANCE",
              expectedVersion: 3,
            },
            tx,
          ),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(database.updates).toEqual([]);
    expect(database.state.equipment).toMatchObject({
      currentUsageHours: 100,
      status: "OPERATIONAL",
      version: 4,
    });
    expect(
      database.state.audits.filter((entry) => entry.result === "SUCCESS"),
    ).toEqual([]);
  });

  it.each([0, 2])(
    "affectedRows=%i เป็น conflict และไม่คืน success",
    async (affectedRows) => {
      database.setAffectedRows(affectedRows);
      const service = createEquipmentMutationService(
        equipmentMutationRepository,
      );

      await expect(
        service.updateEquipmentOperation(
          7,
          10,
          {
            currentUsageHours: 125,
            status: "MAINTENANCE",
            expectedVersion: 3,
          },
          database.directExecutor() as unknown as DbTransaction,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(database.state.equipment).toMatchObject({
        currentUsageHours: 100,
        status: "OPERATIONAL",
        version: 3,
      });
    },
  );

  it("แปลง unique code collision เป็น 409 โดยไม่เผย driver error", async () => {
    database.setUpdateFailure(
      makeWrappedDuplicateError("equipment_code_unique"),
    );
    const service = createEquipmentMutationService(equipmentMutationRepository);

    const promise = service.updateEquipmentMaster(
      7,
      10,
      { code: "bike-02", expectedVersion: 3 },
      database.directExecutor() as unknown as DbTransaction,
    );
    await expect(promise).rejects.toMatchObject({ status: 409 });
    await expect(promise).rejects.not.toThrow(/Duplicate entry|equipment\.code/);
    expect(database.state.equipment).toMatchObject({
      code: "BIKE-01",
      version: 3,
    });
  });

  it("ไม่แปลง duplicate จาก constraint อื่นเป็น equipment code conflict", async () => {
    const unrelatedDuplicate = makeDriverDuplicateError(
      "archived_equipment_code_unique_backup",
    );
    database.setUpdateFailure(unrelatedDuplicate);
    const service = createEquipmentMutationService(equipmentMutationRepository);

    await expect(
      service.updateEquipmentMaster(
        7,
        10,
        { code: "BIKE-02", expectedVersion: 3 },
        database.directExecutor() as unknown as DbTransaction,
      ),
    ).rejects.toBe(unrelatedDuplicate);
    expect(database.state.equipment).toMatchObject({
      code: "BIKE-01",
      version: 3,
    });
  });

  it.each([
    ["backtick hyphen", "`equipment_code_unique-backup`", false],
    ["single-quote dollar", "'equipment_code_unique$archive'", true],
    [
      "qualified backtick hyphen",
      "`fitness`.`equipment_code_unique-backup`",
      true,
    ],
    [
      "qualified single-quote dollar",
      "'fitness.equipment_code_unique$archive'",
      false,
    ],
    [
      "extra qualified segment",
      "`fitness`.`equipment_code_unique`.`backup`",
      true,
    ],
  ])(
    "ไม่แปลง key ที่เพียงขึ้นต้นเหมือน constraint จริง: %s",
    (_label, keyReference, wrapped) => {
      const duplicate = makeDuplicateErrorForKey(keyReference, wrapped);
      expect(repositoryModule.normalizeEquipmentWriteError(duplicate)).toBe(
        duplicate,
      );
    },
  );

  it.each([
    ["plain", "equipment_code_unique", false],
    ["single quoted", "'equipment_code_unique'", true],
    ["backtick quoted", "`equipment_code_unique`", false],
    ["plain qualified", "fitness.equipment_code_unique", true],
    ["single quoted qualified", "'fitness.equipment_code_unique'", false],
    ["backtick qualified", "`fitness`.`equipment_code_unique`", true],
  ])(
    "ยอมรับรูปแบบ MySQL ของ constraint จริง: %s",
    (_label, keyReference, wrapped) => {
      expect(
        repositoryModule.normalizeEquipmentWriteError(
          makeDuplicateErrorForKey(keyReference, wrapped),
        ),
      ).toMatchObject({ status: 409 });
    },
  );

  it("cause ที่วนซ้ำและ getter ที่ throw ไม่ทำให้ classifier กลบ error เดิม", () => {
    const hostileError: Record<string, unknown> = {};
    Object.defineProperty(hostileError, "code", {
      get() {
        throw new Error("HOSTILE_GETTER");
      },
    });
    hostileError.cause = hostileError;

    expect(repositoryModule.normalizeEquipmentWriteError(hostileError)).toBe(
      hostileError,
    );
  });

  it("create ทำ code normalization และแปลง insert race collision เป็น 409", async () => {
    database.setRowVisible(false);
    database.setInsertFailure(
      makeWrappedDuplicateError("equipment_code_unique"),
    );

    const promise = serviceModule.createEquipment(
      {
        branchId: 10,
        code: " bike-02 ",
        name: "Bike 02",
        category: "CARDIO",
        location: "Floor 1",
        currentUsageHours: 0,
      },
      database.directExecutor() as unknown as DbTransaction,
    );

    await expect(promise).rejects.toMatchObject({ status: 409 });
    await expect(promise).rejects.not.toThrow(/Duplicate entry|equipment\.code/);
    expect(database.inserts[0]).toMatchObject({ code: "BIKE-02" });
  });

  it("Audit insert ล้มแล้ว rollback production mutation และ Audit ทั้งหมด", async () => {
    database.setFailAudit(true);
    const service = createEquipmentMutationService(equipmentMutationRepository);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      runAuditedMutation(
        {
          actorStaffId: 2,
          branchId: 10,
          action: "EQUIPMENT_OPERATION_UPDATED",
          entityType: "EQUIPMENT",
          success: () => ({
            entityId: 7,
            metadata: { fields: ["currentUsageHours", "status"] },
          }),
        },
        (tx) =>
          service.updateEquipmentOperation(
            7,
            10,
            {
              currentUsageHours: 125,
              status: "MAINTENANCE",
              expectedVersion: 3,
            },
            tx,
          ),
      ),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");

    expect(database.state.equipment).toMatchObject({
      currentUsageHours: 100,
      status: "OPERATIONAL",
      version: 3,
    });
    expect(database.state.audits).toEqual([]);
    consoleError.mockRestore();
  });

  it("เลิกใช้ซ้ำเป็น conflict โดยไม่เพิ่ม SUCCESS Audit หรือ version", async () => {
    const service = createEquipmentMutationService(equipmentMutationRepository);

    await runAuditedMutation(
      {
        actorStaffId: 2,
        branchId: 10,
        action: "EQUIPMENT_RETIRED",
        entityType: "EQUIPMENT",
        success: () => ({ entityId: 7, metadata: { status: "RETIRED" } }),
      },
      (tx) =>
        service.retireEquipment(
          7,
          10,
          { reason: "ชำรุดถาวร", expectedVersion: 3 },
          new Date("2026-08-21T05:00:00.000Z"),
          tx,
        ),
    );
    await expect(
      runAuditedMutation(
        {
          actorStaffId: 2,
          branchId: 10,
          action: "EQUIPMENT_RETIRED",
          entityType: "EQUIPMENT",
          success: () => ({ entityId: 7, metadata: { status: "RETIRED" } }),
        },
        (tx) =>
          service.retireEquipment(
            7,
            10,
            { reason: "เลิกใช้อีกครั้ง", expectedVersion: 4 },
            new Date("2026-08-21T06:00:00.000Z"),
            tx,
          ),
      ),
    ).rejects.toMatchObject({ status: 409 });

    expect(database.state.equipment).toMatchObject({
      status: "RETIRED",
      retiredReason: "ชำรุดถาวร",
      retiredAt: new Date("2026-08-21T05:00:00.000Z"),
      version: 4,
    });
    expect(
      database.state.audits.filter((entry) => entry.result === "SUCCESS"),
    ).toHaveLength(1);
  });
});
