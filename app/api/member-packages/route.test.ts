import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentBranchId: vi.fn(),
  requirePermission: vi.fn(),
  runAuditedMutation: vi.fn(),
}));

vi.mock("@/lib/branch-service", () => ({ getCurrentBranchId: mocks.getCurrentBranchId }));
vi.mock("@/lib/staff-service", () => ({
  AuthorizationError: class AuthorizationError extends Error {},
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/audit-service", () => ({ runAuditedMutation: mocks.runAuditedMutation }));

import { POST } from "./route";

describe("POST /api/member-packages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentBranchId.mockResolvedValue(1);
    mocks.requirePermission.mockResolvedValue({ staffId: 7 });
    mocks.runAuditedMutation.mockResolvedValue(99);
  });

  it("ปิดช่องทางสร้างสิทธิ์ ACTIVE โดยไม่มี payment และ receipt", async () => {
    const response = await POST();

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({ error: "กรุณาบันทึกการขายผ่านระบบชำระเงิน" });
    expect(mocks.runAuditedMutation).not.toHaveBeenCalled();
  });
});
