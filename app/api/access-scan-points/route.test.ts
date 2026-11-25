import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { accessScanPoints, auditLogs } from "@/db/schema";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), permission: vi.fn(), point: vi.fn(), audit: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction, insert: () => ({ values: mocks.audit }) } }));
vi.mock("@/lib/branch-service", () => ({ getCurrentBranchId: async () => 10 }));
vi.mock("@/lib/staff-service", async original => ({
  ...await original<typeof import("@/lib/staff-service")>(), requirePermission: mocks.permission,
}));

import { AuthorizationError } from "@/lib/staff-service";
import { POST } from "./route";

const origin = "https://fitness.example";

/** ส่ง body ดิบเพื่อทดสอบ JSON เสียและ origin จริงโดยไม่แตะฐานข้อมูล */
function create(body: string, requestOrigin = origin) {
  return POST(new Request(origin + "/api/access-scan-points", { method: "POST", headers: { origin: requestOrigin }, body }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_ORIGIN", origin);
  mocks.permission.mockResolvedValue({ staffId: 7 });
  mocks.point.mockResolvedValue([{ insertId: 31 }]);
  mocks.transaction.mockImplementation(run => run({
    insert(table: unknown) {
      if (table === accessScanPoints) return { values: mocks.point };
      if (table === auditLogs) return { values: mocks.audit };
      throw new Error("unexpected table");
    },
  }));
});
afterEach(() => vi.unstubAllEnvs());

it("บันทึกชื่อที่ตัดช่องว่างพร้อม audit ในสาขาของ session", async () => {
  const response = await create(JSON.stringify({ name: "  ประตูหน้า  " }));
  expect(response.status).toBe(201);
  expect(mocks.permission).toHaveBeenCalledWith("settings.manage", 10, expect.anything());
  expect(mocks.point).toHaveBeenCalledWith({ branchId: 10, name: "ประตูหน้า" });
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ actorStaffId: 7, branchId: 10, entityId: 31, result: "SUCCESS" }));
});

it.each(["{", '{"name":"  "}', JSON.stringify({ name: "a".repeat(81) }), '{"name":"x","branchId":20}'])(
  "ปฏิเสธข้อมูลไม่ถูกต้องก่อนเขียน: %s", async body => {
    expect((await create(body)).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  },
);

it("ปฏิเสธ origin และสิทธิ์ไม่ถูกต้องก่อนเขียน", async () => {
  expect((await create('{"name":"x"}', "https://other.example")).status).toBe(403);
  expect(mocks.permission).not.toHaveBeenCalled();
  mocks.permission.mockRejectedValue(new AuthorizationError("ไม่มีสิทธิ์", 403));
  expect((await create('{"name":"x"}')).status).toBe(403);
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it.each([
  [{ code: "ER_DUP_ENTRY" }, 409],
  [{ cause: { errno: 1062 } }, 409],
  [{ cause: { code: "ER_ACCESS_DENIED_ERROR" } }, 500],
])("แยกชื่อซ้ำจากฐานข้อมูลผิดพลาดโดยไม่คืนรายละเอียด: %j", async (details, status) => {
  mocks.point.mockRejectedValue(Object.assign(new Error("private SQL"), details));
  const response = await create('{"name":"ประตูหน้า"}');
  expect(response.status).toBe(status);
  expect(await response.text()).not.toContain("private SQL");
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ branchId: 10, result: "FAILED" }));
});
