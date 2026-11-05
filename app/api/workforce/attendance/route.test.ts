import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertTrustedOrigin: vi.fn(),
  getCurrentBranchId: vi.fn(),
  getStaffContext: vi.fn(),
  punchAttendance: vi.fn(),
}));

vi.mock("@/lib/auth/request-security", () => ({ assertTrustedOrigin: mocks.assertTrustedOrigin }));
vi.mock("@/lib/branch-service", () => ({ getCurrentBranchId: mocks.getCurrentBranchId }));
vi.mock("@/lib/staff-service", () => ({
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message: string, public status: number) { super(message); }
  },
  getStaffContext: mocks.getStaffContext,
}));
vi.mock("@/lib/workforce-service", () => ({ punchAttendance: mocks.punchAttendance }));

import { POST } from "./route";

describe("POST /api/workforce/attendance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentBranchId.mockResolvedValue(2);
    mocks.getStaffContext.mockResolvedValue({
      staff: { id: 7, role: "TRAINER", homeBranchId: 2 },
    });
    mocks.punchAttendance.mockResolvedValue(19);
  });

  it("ให้พนักงานที่ login ลงเวลาตัวเองได้โดยไม่ต้องมี staff.manage", async () => {
    const response = await POST(new Request("http://localhost:3005/api/workforce/attendance", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(mocks.punchAttendance).toHaveBeenCalledWith(
      { staffId: 7, role: "TRAINER", homeBranchId: 2 },
      2,
    );
  });
});
