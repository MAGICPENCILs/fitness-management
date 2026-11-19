import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  branch: vi.fn(),
  permission: vi.fn(),
  getSettings: vi.fn(),
  audited: vi.fn(),
}));

vi.mock("@/lib/branch-service", () => ({ getCurrentBranchId: mocks.branch }));
vi.mock("@/lib/staff-service", () => ({
  AuthorizationError: class AuthorizationError extends Error { constructor(message: string, public status: number) { super(message); } },
  requirePermission: mocks.permission,
}));
vi.mock("@/lib/access-service", () => ({ getAccessSettings: mocks.getSettings }));
vi.mock("@/lib/audit-service", () => ({ runAuditedMutation: mocks.audited }));

import { GET, PATCH } from "./route";
import { AuthorizationError } from "@/lib/staff-service";

const origin = "https://fitness.example";
function request(body: unknown, requestOrigin = origin) {
  return new Request(`${origin}/api/access-settings`, {
    method: "PATCH",
    headers: { origin: requestOrigin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("access settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_ORIGIN", origin);
    mocks.branch.mockResolvedValue(10);
    mocks.permission.mockResolvedValue({ staffId: 7 });
    mocks.getSettings.mockResolvedValue({ id: 1, graceDays: 3 });
    mocks.audited.mockResolvedValue(undefined);
  });

  it("GET คืนค่า grace ปัจจุบันหลังผ่าน settings.manage", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: 1, graceDays: 3 });
    expect(mocks.permission).toHaveBeenCalledWith("settings.manage", 10);
  });

  it.each([2, 8, 3.5])("PATCH ปฏิเสธ graceDays นอกช่วงหรือไม่ใช่จำนวนเต็ม: %s", async graceDays => {
    const response = await PATCH(request({ graceDays }));
    expect(response.status).toBe(400);
    expect(mocks.audited).not.toHaveBeenCalled();
  });

  it("PATCH บันทึกค่า 3–7 ผ่าน audited singleton mutation", async () => {
    const response = await PATCH(request({ graceDays: 5 }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: "บันทึกการตั้งค่าแล้ว", settings: { id: 1, graceDays: 5 } });
    expect(mocks.audited).toHaveBeenCalledWith(
      expect.objectContaining({ actorStaffId: 7, branchId: 10, action: "ACCESS_SETTINGS_UPDATED", entityId: 1 }),
      expect.any(Function),
    );
  });

  it("PATCH ปฏิเสธ origin ภายนอกก่อนอ่าน session", async () => {
    const response = await PATCH(request({ graceDays: 5 }, "https://attacker.example"));
    expect(response.status).toBe(403);
    expect(mocks.branch).not.toHaveBeenCalled();
  });

  it("ไม่เปิดเผยค่าตั้งให้ผู้ไม่มี settings.manage", async () => {
    mocks.permission.mockRejectedValue(new AuthorizationError("ไม่มีสิทธิ์", 403));
    const response = await GET();
    expect(response.status).toBe(403);
    expect(mocks.getSettings).not.toHaveBeenCalled();
  });
});
