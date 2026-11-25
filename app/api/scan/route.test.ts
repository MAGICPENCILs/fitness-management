import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ scan: vi.fn(), permission: vi.fn(), open: vi.fn(), audit: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/branch-service", () => ({ getCurrentBranchId: async () => 10 }));
vi.mock("@/lib/staff-service", () => ({ AuthorizationError: class extends Error {}, requirePermission: mocks.permission }));
vi.mock("@/lib/access-service", async original => ({ ...await original<typeof import("@/lib/access-service")>(), processCardScan: mocks.scan }));
vi.mock("@/lib/audit-service", () => ({ runAuditedMutation: (_: unknown, run: (tx: string) => unknown) => run("tx"), writeAudit: mocks.audit }));
vi.mock("@/lib/hardware/adapter", () => ({ loadHardwareEnvironment: () => ({ mode: "webhook" }), requestDoorOpen: mocks.open }));

import { POST } from "./route";
import { ScanPointNotFoundError } from "@/lib/access-service";

/** ส่งคำขอเหมือน kiosk โดยไม่แตะฐานหรือ controller จริง */
function scan(body: unknown) {
  return POST(new Request("https://fitness.example/api/scan", { method: "POST", headers: { origin: "https://fitness.example" }, body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("APP_ORIGIN", "https://fitness.example");
  mocks.permission.mockResolvedValue({ staffId: 7 });
  mocks.scan.mockResolvedValue({ result: "APPROVED" });
  mocks.open.mockResolvedValue({ opened: true, status: "OPENED" });
});
afterEach(() => vi.unstubAllEnvs());

it("ไม่ส่งจุดใหม่ไปเปิดประตู legacy และตรวจสาขาจาก session", async () => {
  const response = await scan({ serial: "CARD-007", scanPointId: 31 });
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ door: { opened: false, status: "DISABLED" } });
  expect(mocks.permission).toHaveBeenCalledWith("access.manage", 10, expect.anything());
  expect(mocks.scan).toHaveBeenCalledWith("tx", 10, "CARD-007", undefined, 31);
  expect(mocks.open).not.toHaveBeenCalled();
});

it("ตอบ 404 แบบเดียวเมื่อไม่พบจุดในสาขาและไม่เรียก controller", async () => {
  mocks.scan.mockRejectedValue(new ScanPointNotFoundError());
  expect((await scan({ serial: "CARD-007", scanPointId: 32 })).status).toBe(404);
  expect(mocks.open).not.toHaveBeenCalled();
});

it("ยังคงใช้ controller เดิมเมื่อ kiosk ส่งเฉพาะ serial", async () => {
  const response = await scan({ serial: "CARD-007" });
  expect(response.status).toBe(200);
  expect(mocks.open).toHaveBeenCalledOnce();
});

it.each([{ scanPointId: -1 }, { scanPointId: "31" }, { branchId: 99 }])("ปฏิเสธค่าจุดหรือสาขาที่ client ส่งไม่ถูกต้อง: %j", async input => {
  expect((await scan({ serial: "CARD-007", ...input })).status).toBe(400);
  expect(mocks.scan).not.toHaveBeenCalled();
  expect(mocks.open).not.toHaveBeenCalled();
});

it("ปฏิเสธรหัสบัตรที่ยาวเกินคอลัมน์ log แต่ยังรับ Dynamic QR", async () => {
  expect((await scan({ serial: "C".repeat(21), scanPointId: 31 })).status).toBe(400);
  expect(mocks.scan).not.toHaveBeenCalled();
  expect((await scan({ serial: `FQR.${"q".repeat(40)}`, scanPointId: 31 })).status).toBe(200);
});
