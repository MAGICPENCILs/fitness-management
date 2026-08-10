import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/staff-service", { spy: true });

import {
  AuthorizationError,
  getStaffContext,
} from "@/lib/staff-service";
import {
  BranchOperationError,
  getCurrentBranchId,
  setCurrentBranchCookie,
} from "@/lib/branch-service";

describe("branch session error boundaries", () => {
  beforeEach(() => {
    vi.mocked(getStaffContext).mockReset();
    vi.mocked(getStaffContext).mockRejectedValue(
      new AuthorizationError("กรุณาเข้าสู่ระบบ", 401),
    );
  });

  it("คง AuthorizationError 401 จาก getCurrentBranchId ให้ guarded API route จับ", async () => {
    await expect(getCurrentBranchId()).rejects.toEqual(
      expect.objectContaining<Partial<AuthorizationError>>({
        name: "AuthorizationError",
        status: 401,
      }),
    );
  });

  it("แปลง invalid session เป็น BranchOperationError 401 ที่ selector route จับได้", async () => {
    await expect(setCurrentBranchCookie(1)).rejects.toEqual(
      expect.objectContaining<Partial<BranchOperationError>>({
        name: "BranchOperationError",
        status: 401,
      }),
    );
  });
});
