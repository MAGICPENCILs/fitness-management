import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session-service", { spy: true });

import {
  requireFullSession,
  SessionAuthenticationError,
} from "@/lib/auth/session-service";
import {
  AuthorizationError,
  getStaffContext,
  setCurrentStaffCookie,
  StaffOperationError,
} from "@/lib/staff-service";

describe("Staff session error boundaries", () => {
  beforeEach(() => {
    vi.mocked(requireFullSession).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["REVOKED", "EXPIRED"] as const)(
    "แปลง %s session เป็น AuthorizationError 401 ที่ API guard จับได้",
    async (reason) => {
      vi.mocked(requireFullSession).mockRejectedValue(
        new SessionAuthenticationError("กรุณาเข้าสู่ระบบ", 401, reason),
      );

      await expect(getStaffContext()).rejects.toEqual(
        expect.objectContaining<Partial<AuthorizationError>>({
          name: "AuthorizationError",
          status: 401,
        }),
      );
    },
  );

  it("แปลง invalid session เป็น StaffOperationError 401 ที่ dev selector route จับได้", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_STAFF_SWITCHER", "true");
    vi.mocked(requireFullSession).mockRejectedValue(
      new SessionAuthenticationError(
        "กรุณาเข้าสู่ระบบ",
        401,
        "EXPIRED",
      ),
    );

    await expect(setCurrentStaffCookie(1, {
      ipFingerprint: null,
      userAgentCategory: "UNKNOWN",
    })).rejects.toEqual(
      expect.objectContaining<Partial<StaffOperationError>>({
        name: "StaffOperationError",
        status: 401,
      }),
    );
  });
});
