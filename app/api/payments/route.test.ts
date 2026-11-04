import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  txSelect: vi.fn(),
  getCurrentBranchId: vi.fn(),
  requirePermission: vi.fn(),
  runAuditedMutation: vi.fn(),
}));

function selectResult(rows: unknown[]) {
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    leftJoin: vi.fn(),
    limit: vi.fn(),
    for: vi.fn().mockResolvedValue(rows),
    then: (onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(onFulfilled, onRejected),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.leftJoin.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

vi.mock("@/db", () => ({ db: { select: mocks.dbSelect } }));
vi.mock("@/lib/branch-service", () => ({ getCurrentBranchId: mocks.getCurrentBranchId }));
vi.mock("@/lib/staff-service", () => ({
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message: string, public status: number) { super(message); }
  },
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/audit-service", () => ({ runAuditedMutation: mocks.runAuditedMutation }));

import { POST } from "./route";

const APP_ORIGIN = "https://fitness.example";
const validBody = {
  memberId: 22,
  packageId: 3,
  method: "CASH",
  startDate: "2026-11-04",
};

function paymentRequest(origin: string) {
  return new Request(`${APP_ORIGIN}/api/payments`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(validBody),
  });
}

describe("POST /api/payments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_ORIGIN = APP_ORIGIN;
    mocks.getCurrentBranchId.mockResolvedValue(1);
    mocks.requirePermission.mockResolvedValue({ staffId: 7, role: "OWNER", homeBranchId: 1 });
    mocks.dbSelect.mockImplementation((selection?: Record<string, unknown>) => {
      if (selection?.firstName) return selectResult([{ id: 22, status: "ACTIVE", firstName: "ข้าม", lastName: "สาขา" }]);
      if (selection?.settings) return selectResult([{ id: 1, name: "A", address: "", phone: "", settings: null }]);
      return selectResult([{ id: 3, name: "Monthly", price: "1000.00", durationDays: 30, isActive: true }]);
    });
    mocks.txSelect.mockReturnValue(selectResult([]));
    mocks.runAuditedMutation.mockImplementation((_audit, mutation) => mutation({ select: mocks.txSelect }));
  });

  it("ปฏิเสธ Origin ภายนอกก่อนอ่านสาขา session หรือฐานข้อมูล", async () => {
    const response = await POST(paymentRequest("https://attacker.example"));

    expect(response.status).toBe(403);
    expect(mocks.getCurrentBranchId).not.toHaveBeenCalled();
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.dbSelect).not.toHaveBeenCalled();
  });

  it("ปฏิเสธสมาชิกสาขา B เมื่อพนักงานกำลังรับชำระที่สาขา A", async () => {
    const response = await POST(paymentRequest(APP_ORIGIN));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "สมาชิกไม่อยู่ในสถานะที่รับชำระได้" });
  });
});
