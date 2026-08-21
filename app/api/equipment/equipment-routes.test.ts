import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  assertTrustedOrigin: vi.fn(),
  getCurrentBranchId: vi.fn(),
  requirePermission: vi.fn(),
  getEquipmentDetail: vi.fn(),
  createEquipment: vi.fn(),
  updateEquipmentMaster: vi.fn(),
  updateEquipmentOperation: vi.fn(),
  recordMaintenance: vi.fn(),
  retireEquipment: vi.fn(),
  runAuditedMutation: vi.fn(),
}));

vi.mock("@/lib/auth/request-security", () => ({
  assertTrustedOrigin: mocks.assertTrustedOrigin,
}));
vi.mock("@/lib/branch-service", () => ({
  getCurrentBranchId: mocks.getCurrentBranchId,
}));
vi.mock("@/lib/staff-service", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/staff-service")>(
      "@/lib/staff-service",
    );
  return { ...actual, requirePermission: mocks.requirePermission };
});
vi.mock("@/lib/equipment-service", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/equipment-service")>(
      "@/lib/equipment-service",
    );
  return {
    ...actual,
    getEquipmentDetail: mocks.getEquipmentDetail,
    createEquipment: mocks.createEquipment,
    updateEquipmentMaster: mocks.updateEquipmentMaster,
    updateEquipmentOperation: mocks.updateEquipmentOperation,
    recordMaintenance: mocks.recordMaintenance,
    retireEquipment: mocks.retireEquipment,
  };
});
vi.mock("@/lib/audit-service", () => ({
  runAuditedMutation: mocks.runAuditedMutation,
}));

import { EquipmentOperationError } from "@/lib/equipment-service";
import { AuthorizationError } from "@/lib/staff-service";

const APP_ORIGIN = "https://fitness.example";
const TODAY = "2026-08-21";
const actor = { staffId: 9, role: "MANAGER" as const, homeBranchId: 10 };
const auditedTransaction = { marker: "equipment-route-transaction" };

const detailDto = {
  equipment: {
    id: 7,
    code: "BIKE-07",
    name: "จักรยานนั่งปั่น",
    category: "CARDIO",
    location: "ชั้น 2",
    serialNumber: "SERIAL-ROUTE-SECRET",
    status: "OPERATIONAL",
    retiredAt: null,
    retiredReason: null,
    version: 3,
    purchaseDate: "2026-01-01",
    warrantyEndDate: "2027-01-01",
    currentUsageHours: 120,
    maintenanceIntervalHours: 500,
    nextMaintenanceHours: 620,
    nextMaintenanceDate: "2026-09-01",
    lastMaintenanceDate: null,
    note: "รายละเอียดภายใน",
    maintenanceState: "SCHEDULED",
    remainingHours: 500,
    remainingDays: 11,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  },
  history: [],
  historyPagination: { page: 3, pageSize: 20, total: 0, totalPages: 0 },
};

const createBody = {
  code: "bike-91",
  name: "จักรยานทดสอบ",
  category: "CARDIO",
  location: "ชั้น 1",
  serialNumber: "SERIAL-AUDIT-SECRET",
  currentUsageHours: 20,
  note: "NOTE-AUDIT-SECRET TOKEN-ROUTE-SECRET HASH-ROUTE-SECRET",
};
const masterBody = {
  name: "จักรยานรุ่นใหม่",
  serialNumber: "SERIAL-MASTER-SECRET",
  note: "NOTE-MASTER-SECRET",
  expectedVersion: 3,
};
const operationBody = {
  currentUsageHours: 140,
  status: "MAINTENANCE",
  expectedVersion: 3,
};
const maintenanceBody = {
  type: "REPAIR",
  status: "COMPLETED",
  scheduledDate: "2026-08-20",
  completedDate: "2026-08-21",
  usageHoursAtService: 140,
  cost: 1250.5,
  technician: "ช่างทดสอบ",
  nextMaintenanceDate: "2026-09-21",
  note: "NOTE-MAINTENANCE-SECRET",
  expectedVersion: 3,
};
const retireBody = {
  reason: "REASON-RETIREMENT-SECRET",
  expectedVersion: 3,
};

type RouteContext = { params: Promise<{ id: string }> };
type RouteModule = Record<string, unknown>;
type RouteLoader = () => Promise<RouteModule>;

/** โหลด route แบบ runtime เพื่อให้ RED ระบุ export/endpoint ที่ยังไม่มีโดยไม่หยุดทั้ง test file */
const loadCollectionRoute: RouteLoader = async () =>
  (await import("@/app/api/equipment/route")) as RouteModule;
const loadDetailRoute: RouteLoader = async () =>
  (await import("@/app/api/equipment/[id]/route")) as RouteModule;
const loadMaintenanceRoute: RouteLoader = async () =>
  (await import("@/app/api/equipment/[id]/maintenance/route")) as RouteModule;
const loadRetireRoute: RouteLoader = async () =>
  (await import("@/app/api/equipment/[id]/retire/route")) as RouteModule;

/** สร้าง context ตาม Next 16 ซึ่งกำหนด dynamic params เป็น Promise */
function params(id: string): RouteContext {
  return { params: Promise.resolve({ id }) };
}

/** สร้าง Request จริงพร้อม Origin และ header sentinel เพื่อทดสอบ HTTP boundary โดยตรง */
function mutationRequest(
  path: string,
  method: string,
  rawBody: string | undefined,
  origin = APP_ORIGIN,
) {
  return new Request(`${APP_ORIGIN}${path}`, {
    method,
    headers: {
      origin,
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.77",
      "user-agent": "Full-UA-Audit-Secret/1.0",
    },
    ...(rawBody === undefined ? {} : { body: rawBody }),
  });
}

/** เรียก export จริงและทำให้ export ที่ขาดเป็น RED ที่อ่านสาเหตุได้ตรงไปตรงมา */
async function callRoute(
  load: RouteLoader,
  method: string,
  request: Request,
  context?: RouteContext,
) {
  const route = await load();
  const handler = route[method];
  expect(handler, `route must export ${method}`).toBeTypeOf("function");
  return context
    ? (handler as (request: Request, context: RouteContext) => Promise<Response>)(
        request,
        context,
      )
    : (handler as (request: Request) => Promise<Response>)(request);
}

const mutationRoutes = [
  {
    label: "create",
    load: loadCollectionRoute,
    method: "POST",
    path: "/api/equipment",
    body: createBody,
    context: undefined,
  },
  {
    label: "master",
    load: loadDetailRoute,
    method: "PUT",
    path: "/api/equipment/7",
    body: masterBody,
    context: params("7"),
  },
  {
    label: "operation",
    load: loadDetailRoute,
    method: "PATCH",
    path: "/api/equipment/7",
    body: operationBody,
    context: params("7"),
  },
  {
    label: "maintenance",
    load: loadMaintenanceRoute,
    method: "POST",
    path: "/api/equipment/7/maintenance",
    body: maintenanceBody,
    context: params("7"),
  },
  {
    label: "retire",
    load: loadRetireRoute,
    method: "POST",
    path: "/api/equipment/7/retire",
    body: retireBody,
    context: params("7"),
  },
] as const;

/** รวม service mutation ทั้งหมดเพื่อพิสูจน์ว่า guard/validation หยุดก่อนแตะงานธุรกิจ */
function mutationServiceMocks() {
  return [
    mocks.createEquipment,
    mocks.updateEquipmentMaster,
    mocks.updateEquipmentOperation,
    mocks.recordMaintenance,
    mocks.retireEquipment,
  ];
}

/** อ่าน Audit context ที่ handler ส่งจริงเพื่อเทียบ identity และ metadata แบบ exact */
function lastAuditContext() {
  return mocks.runAuditedMutation.mock.calls.at(-1)?.[0] as {
    actorStaffId: number;
    branchId: number;
    action: string;
    entityType: string;
    entityId?: number;
    metadata?: Record<string, unknown>;
    success?: (value: unknown) => Record<string, unknown>;
  };
}

describe("equipment API routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.events.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T05:00:00.000Z`));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    mocks.assertTrustedOrigin.mockImplementation(() => {
      mocks.events.push("origin");
    });
    mocks.getCurrentBranchId.mockImplementation(async () => {
      mocks.events.push("branch");
      return 10;
    });
    mocks.requirePermission.mockImplementation(async () => {
      mocks.events.push("permission");
      return actor;
    });
    mocks.getEquipmentDetail.mockResolvedValue(detailDto);
    mocks.createEquipment.mockImplementation(async () => {
      mocks.events.push("create-service");
      return 91;
    });
    mocks.updateEquipmentMaster.mockImplementation(async () => {
      mocks.events.push("master-service");
      return { equipmentId: 7, version: 4 };
    });
    mocks.updateEquipmentOperation.mockImplementation(async () => {
      mocks.events.push("operation-service");
      return { equipmentId: 7, version: 4 };
    });
    mocks.recordMaintenance.mockImplementation(async () => {
      mocks.events.push("maintenance-service");
      return { maintenanceId: 31, equipmentVersion: 4 };
    });
    mocks.retireEquipment.mockImplementation(async () => {
      mocks.events.push("retire-service");
      return { equipmentId: 7, version: 4 };
    });
    mocks.runAuditedMutation.mockImplementation(
      async (
        context: { success?: (value: unknown) => unknown },
        callback: (tx: typeof auditedTransaction) => Promise<unknown>,
      ) => {
        mocks.events.push("audit");
        const value = await callback(auditedTransaction);
        context.success?.(value);
        return value;
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(mutationRoutes)(
    "$label ปฏิเสธ Origin ก่อน branch/auth/body/audit/service",
    async ({ load, method, path, context }) => {
      mocks.assertTrustedOrigin.mockImplementationOnce(() => {
        mocks.events.push("origin");
        throw new Error("Untrusted origin");
      });

      const response = await callRoute(
        load,
        method,
        mutationRequest(path, method, "{", "https://evil.example"),
        context,
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "ไม่สามารถดำเนินการได้" });
      expect(mocks.events).toEqual(["origin"]);
      expect(mocks.getCurrentBranchId).not.toHaveBeenCalled();
      expect(mocks.requirePermission).not.toHaveBeenCalled();
      expect(mocks.runAuditedMutation).not.toHaveBeenCalled();
      for (const service of mutationServiceMocks()) {
        expect(service).not.toHaveBeenCalled();
      }
    },
  );

  it.each(
    mutationRoutes.flatMap((route) => [
      { ...route, malformedCase: "malformed", rawBody: "{" },
      { ...route, malformedCase: "empty", rawBody: undefined },
    ]),
  )(
    "$label คืน 400 fixed copy เมื่อ JSON เป็น $malformedCase หลังผ่าน guard",
    async ({ load, method, path, context, rawBody }) => {
      const response = await callRoute(
        load,
        method,
        mutationRequest(path, method, rawBody),
        context,
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "ข้อมูลอุปกรณ์ไม่ถูกต้อง" });
      expect(mocks.events).toEqual(["origin", "branch", "permission"]);
      expect(mocks.runAuditedMutation).not.toHaveBeenCalled();
      for (const service of mutationServiceMocks()) {
        expect(service).not.toHaveBeenCalled();
      }
    },
  );

  it("ตรวจ Session/permission ก่อนอ่าน JSON body", async () => {
    mocks.requirePermission.mockImplementationOnce(async () => {
      mocks.events.push("permission");
      throw new AuthorizationError("กรุณาเข้าสู่ระบบ", 401);
    });

    const response = await callRoute(
      loadDetailRoute,
      "PATCH",
      mutationRequest("/api/equipment/7", "PATCH", "{"),
      params("7"),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "กรุณาเข้าสู่ระบบ" });
    expect(mocks.events).toEqual(["origin", "branch", "permission"]);
    expect(mocks.runAuditedMutation).not.toHaveBeenCalled();
    expect(mocks.updateEquipmentOperation).not.toHaveBeenCalled();
  });

  it.each(["COUNTER", "TRAINER"])(
    "mutation ปฏิเสธบทบาท %s ด้วย 403 ก่อน audit/service",
    async () => {
      mocks.requirePermission.mockImplementationOnce(async () => {
        mocks.events.push("permission");
        throw new AuthorizationError("บัญชีนี้ไม่มีสิทธิ์ดำเนินการ", 403);
      });

      const response = await callRoute(
        loadDetailRoute,
        "PATCH",
        mutationRequest(
          "/api/equipment/7",
          "PATCH",
          JSON.stringify(operationBody),
        ),
        params("7"),
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "บัญชีนี้ไม่มีสิทธิ์ดำเนินการ",
      });
      expect(mocks.runAuditedMutation).not.toHaveBeenCalled();
      expect(mocks.updateEquipmentOperation).not.toHaveBeenCalled();
    },
  );

  it("Manager หา entity ข้าม branch ไม่พบเป็น 404 โดยไม่เปิดเผยข้อมูลอีกสาขา", async () => {
    mocks.updateEquipmentMaster.mockRejectedValueOnce(
      new EquipmentOperationError("ไม่พบอุปกรณ์", 404),
    );

    const response = await callRoute(
      loadDetailRoute,
      "PUT",
      mutationRequest(
        "/api/equipment/7",
        "PUT",
        JSON.stringify(masterBody),
      ),
      params("7"),
    );

    const body = await response.json();
    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "ไม่พบอุปกรณ์" });
    expect(JSON.stringify(body)).not.toContain("OTHER-BRANCH-SECRET");
    expect(mocks.updateEquipmentMaster).toHaveBeenCalledWith(
      7,
      10,
      masterBody,
      auditedTransaction,
    );
  });

  it("ปฏิเสธ selected branch ที่ไม่มีสิทธิ์เป็น 403 โดยไม่แตะ entity service", async () => {
    mocks.requirePermission.mockImplementationOnce(async () => {
      mocks.events.push("permission");
      throw new AuthorizationError("บัญชีนี้ไม่มีสิทธิ์ดำเนินการ", 403);
    });

    const response = await callRoute(
      loadDetailRoute,
      "GET",
      new Request(`${APP_ORIGIN}/api/equipment/7?historyPage=1`),
      params("7"),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "บัญชีนี้ไม่มีสิทธิ์ดำเนินการ",
    });
    expect(mocks.getEquipmentDetail).not.toHaveBeenCalled();
  });

  it("stale version คืน 409 fixed refresh copy โดยไม่มี success response", async () => {
    mocks.updateEquipmentOperation.mockRejectedValueOnce(
      new EquipmentOperationError(
        "ข้อมูลอุปกรณ์มีการเปลี่ยนแปลง กรุณาโหลดใหม่",
        409,
      ),
    );

    const response = await callRoute(
      loadDetailRoute,
      "PATCH",
      mutationRequest(
        "/api/equipment/7",
        "PATCH",
        JSON.stringify(operationBody),
      ),
      params("7"),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "ข้อมูลอุปกรณ์มีการเปลี่ยนแปลง กรุณาโหลดใหม่",
    });
    expect(mocks.runAuditedMutation).toHaveBeenCalledOnce();
    expect(mocks.updateEquipmentOperation).toHaveBeenCalledOnce();
  });

  it("unknown Drizzle/SQL error ตอบ generic และ log เฉพาะ fixed label กับ error name", async () => {
    const sentinels = [
      "SELECT * FROM equipment WHERE token = ?",
      "TOKEN-ROUTE-SECRET",
      "HASH-ROUTE-SECRET",
      "CODE-ROUTE-SECRET",
      "203.0.113.77",
      "Full-UA-Audit-Secret/1.0",
    ];
    const error = new Error(sentinels.join(" | "));
    error.name = "DrizzleQueryError";
    mocks.getEquipmentDetail.mockRejectedValueOnce(error);

    const response = await callRoute(
      loadDetailRoute,
      "GET",
      new Request(`${APP_ORIGIN}/api/equipment/7?historyPage=1`, {
        headers: {
          "x-forwarded-for": sentinels[4],
          "user-agent": sentinels[5],
        },
      }),
      params("7"),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "ไม่สามารถดำเนินการกับอุปกรณ์ได้" });
    expect(console.error).toHaveBeenCalledWith(
      "Equipment route unavailable",
      "DrizzleQueryError",
    );
    const observable = JSON.stringify({ body, logs: vi.mocked(console.error).mock.calls });
    for (const sentinel of sentinels) expect(observable).not.toContain(sentinel);
  });

  it.each(["OWNER", "MANAGER", "COUNTER", "TRAINER"] as const)(
    "GET detail เปิดให้ %s ผ่าน equipment.read โดยไม่ตรวจ Origin",
    async (role) => {
      mocks.requirePermission.mockResolvedValueOnce({ ...actor, role });

      const response = await callRoute(
        loadDetailRoute,
        "GET",
        new Request(`${APP_ORIGIN}/api/equipment/7?historyPage=3`),
        params("7"),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(detailDto);
      expect(mocks.assertTrustedOrigin).not.toHaveBeenCalled();
      expect(mocks.requirePermission).toHaveBeenCalledWith(
        "equipment.read",
        10,
        { action: "EQUIPMENT_READ", entityType: "EQUIPMENT" },
      );
      expect(mocks.getEquipmentDetail).toHaveBeenCalledWith(TODAY, 10, 7, 3);
    },
  );

  it.each([
    ["0", "1"],
    ["-1", "1"],
    ["abc", "1"],
    ["1.5", "1"],
    ["7", "0"],
    ["7", "-2"],
    ["7", "nope"],
    ["7", "1.5"],
  ])("GET detail ปฏิเสธ id=%s/historyPage=%s ที่ไม่เป็นจำนวนเต็มบวก", async (id, page) => {
    const response = await callRoute(
      loadDetailRoute,
      "GET",
      new Request(`${APP_ORIGIN}/api/equipment/${id}?historyPage=${page}`),
      params(id),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "ข้อมูลอุปกรณ์ไม่ถูกต้อง" });
    expect(mocks.getEquipmentDetail).not.toHaveBeenCalled();
  });

  it("POST create ใช้ Origin → branch/manage → schema → audited tx และคืน body คงที่", async () => {
    const response = await callRoute(
      loadCollectionRoute,
      "POST",
      mutationRequest(
        "/api/equipment",
        "POST",
        JSON.stringify(createBody),
      ),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      message: "เพิ่มอุปกรณ์แล้ว",
      id: 91,
      version: 1,
    });
    expect(mocks.events).toEqual([
      "origin",
      "branch",
      "permission",
      "audit",
      "create-service",
    ]);
    expect(mocks.requirePermission).toHaveBeenCalledWith(
      "equipment.manage",
      10,
      { action: "EQUIPMENT_CREATED", entityType: "EQUIPMENT" },
    );
    expect(mocks.createEquipment).toHaveBeenCalledWith(
      {
        ...createBody,
        code: "BIKE-91",
        branchId: 10,
        maintenanceIntervalHours: undefined,
      },
      auditedTransaction,
    );
    const audit = lastAuditContext();
    expect(audit).toEqual({
      actorStaffId: 9,
      branchId: 10,
      action: "EQUIPMENT_CREATED",
      entityType: "EQUIPMENT",
      success: expect.any(Function),
    });
    expect(audit.success?.(91)).toEqual({ entityId: 91 });
  });

  it("PUT master ส่งเฉพาะชื่อ field ที่แก้เข้า Audit และใช้ tx เดียวกับ service", async () => {
    const response = await callRoute(
      loadDetailRoute,
      "PUT",
      mutationRequest(
        "/api/equipment/7",
        "PUT",
        JSON.stringify(masterBody),
      ),
      params("7"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: "แก้ไขข้อมูลอุปกรณ์แล้ว",
      id: 7,
      version: 4,
    });
    expect(mocks.events).toEqual([
      "origin",
      "branch",
      "permission",
      "audit",
      "master-service",
    ]);
    expect(mocks.requirePermission).toHaveBeenCalledWith(
      "equipment.manage",
      10,
      { action: "EQUIPMENT_MASTER_UPDATED", entityType: "EQUIPMENT" },
    );
    expect(mocks.updateEquipmentMaster).toHaveBeenCalledWith(
      7,
      10,
      masterBody,
      auditedTransaction,
    );
    expect(lastAuditContext()).toEqual({
      actorStaffId: 9,
      branchId: 10,
      action: "EQUIPMENT_MASTER_UPDATED",
      entityType: "EQUIPMENT",
      entityId: 7,
      metadata: { fields: ["name", "serialNumber", "note"] },
    });
  });

  it("PATCH operation บันทึก status/ชื่อ field เท่านั้นและคืน next version", async () => {
    const response = await callRoute(
      loadDetailRoute,
      "PATCH",
      mutationRequest(
        "/api/equipment/7",
        "PATCH",
        JSON.stringify(operationBody),
      ),
      params("7"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: "อัปเดตสถานะอุปกรณ์แล้ว",
      id: 7,
      version: 4,
    });
    expect(mocks.events).toEqual([
      "origin",
      "branch",
      "permission",
      "audit",
      "operation-service",
    ]);
    expect(mocks.requirePermission).toHaveBeenCalledWith(
      "equipment.manage",
      10,
      { action: "EQUIPMENT_OPERATION_UPDATED", entityType: "EQUIPMENT" },
    );
    expect(mocks.updateEquipmentOperation).toHaveBeenCalledWith(
      7,
      10,
      operationBody,
      auditedTransaction,
    );
    expect(lastAuditContext()).toEqual({
      actorStaffId: 9,
      branchId: 10,
      action: "EQUIPMENT_OPERATION_UPDATED",
      entityType: "EQUIPMENT",
      entityId: 7,
      metadata: {
        status: "MAINTENANCE",
        fields: ["currentUsageHours", "status"],
      },
    });
  });

  it("POST maintenance ใช้ maintenance id เป็น Audit entity และคืน equipment version", async () => {
    const response = await callRoute(
      loadMaintenanceRoute,
      "POST",
      mutationRequest(
        "/api/equipment/7/maintenance",
        "POST",
        JSON.stringify(maintenanceBody),
      ),
      params("7"),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      message: "บันทึกงานบำรุงรักษาแล้ว",
      id: 31,
      version: 4,
    });
    expect(mocks.events).toEqual([
      "origin",
      "branch",
      "permission",
      "audit",
      "maintenance-service",
    ]);
    expect(mocks.requirePermission).toHaveBeenCalledWith(
      "equipment.manage",
      10,
      { action: "MAINTENANCE_RECORDED", entityType: "MAINTENANCE" },
    );
    expect(mocks.recordMaintenance).toHaveBeenCalledWith(
      7,
      10,
      maintenanceBody,
      auditedTransaction,
    );
    const audit = lastAuditContext();
    expect(audit).toEqual({
      actorStaffId: 9,
      branchId: 10,
      action: "MAINTENANCE_RECORDED",
      entityType: "MAINTENANCE",
      metadata: {
        maintenanceType: "REPAIR",
        maintenanceStatus: "COMPLETED",
      },
      success: expect.any(Function),
    });
    expect(
      audit.success?.({ maintenanceId: 31, equipmentVersion: 4 }),
    ).toEqual({ entityId: 31 });
  });

  it("POST retire เก็บเฉพาะ RETIRED ใน Audit และไม่เก็บเหตุผล", async () => {
    const response = await callRoute(
      loadRetireRoute,
      "POST",
      mutationRequest(
        "/api/equipment/7/retire",
        "POST",
        JSON.stringify(retireBody),
      ),
      params("7"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: "เลิกใช้งานอุปกรณ์แล้ว",
      id: 7,
      version: 4,
    });
    expect(mocks.events).toEqual([
      "origin",
      "branch",
      "permission",
      "audit",
      "retire-service",
    ]);
    expect(mocks.requirePermission).toHaveBeenCalledWith(
      "equipment.manage",
      10,
      { action: "EQUIPMENT_RETIRED", entityType: "EQUIPMENT" },
    );
    expect(mocks.retireEquipment).toHaveBeenCalledWith(
      7,
      10,
      retireBody,
      new Date(`${TODAY}T05:00:00.000Z`),
      auditedTransaction,
    );
    expect(lastAuditContext()).toEqual({
      actorStaffId: 9,
      branchId: 10,
      action: "EQUIPMENT_RETIRED",
      entityType: "EQUIPMENT",
      entityId: 7,
      metadata: { status: "RETIRED" },
    });
  });

  it("Audit metadata ไม่สะท้อน reason/note/serial/cost/token/hash/IP/full UA", async () => {
    await callRoute(
      loadCollectionRoute,
      "POST",
      mutationRequest(
        "/api/equipment",
        "POST",
        JSON.stringify(createBody),
      ),
    );
    await callRoute(
      loadDetailRoute,
      "PUT",
      mutationRequest(
        "/api/equipment/7",
        "PUT",
        JSON.stringify(masterBody),
      ),
      params("7"),
    );
    await callRoute(
      loadMaintenanceRoute,
      "POST",
      mutationRequest(
        "/api/equipment/7/maintenance",
        "POST",
        JSON.stringify(maintenanceBody),
      ),
      params("7"),
    );
    await callRoute(
      loadRetireRoute,
      "POST",
      mutationRequest(
        "/api/equipment/7/retire",
        "POST",
        JSON.stringify(retireBody),
      ),
      params("7"),
    );

    const auditPayload = JSON.stringify(
      mocks.runAuditedMutation.mock.calls.map(([context]) => context),
    );
    for (const secret of [
      "REASON-RETIREMENT-SECRET",
      "NOTE-AUDIT-SECRET",
      "NOTE-MASTER-SECRET",
      "NOTE-MAINTENANCE-SECRET",
      "SERIAL-AUDIT-SECRET",
      "SERIAL-MASTER-SECRET",
      "1250.5",
      "TOKEN-ROUTE-SECRET",
      "HASH-ROUTE-SECRET",
      "203.0.113.77",
      "Full-UA-Audit-Secret/1.0",
    ]) {
      expect(auditPayload).not.toContain(secret);
    }
  });
});
