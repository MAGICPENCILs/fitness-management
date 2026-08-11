import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireFullSession: vi.fn(),
  getBranchContext: vi.fn(),
  getStaffContext: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/auth/session-service", () => ({
  requireFullSession: mocks.requireFullSession,
  SessionAuthenticationError: class SessionAuthenticationError extends Error {
    constructor(
      message: string,
      public status: 401 | 403,
      public reason: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("@/lib/branch-service", () => ({
  getBranchContext: mocks.getBranchContext,
}));
vi.mock("@/lib/staff-service", () => ({
  getStaffContext: mocks.getStaffContext,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/sidebar", () => ({ Sidebar: () => null }));

import ProtectedLayout from "@/app/(protected)/layout";
import { SessionAuthenticationError } from "@/lib/auth/session-service";

describe("protected application layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["MISSING", "EXPIRED"])(
    "redirects %s sessions to login",
    async (reason) => {
      mocks.requireFullSession.mockRejectedValue(
        new SessionAuthenticationError("invalid", 401, reason as "MISSING"),
      );

      await expect(
        ProtectedLayout({ children: <div>content</div> }),
      ).rejects.toThrow("REDIRECT:/login");
      expect(mocks.redirect).toHaveBeenCalledWith("/login");
    },
  );

  it("redirects a forced-password session to change-password", async () => {
    mocks.requireFullSession.mockRejectedValue(
      new SessionAuthenticationError(
        "password required",
        403,
        "PASSWORD_CHANGE_REQUIRED",
      ),
    );

    await expect(
      ProtectedLayout({ children: <div>content</div> }),
    ).rejects.toThrow("REDIRECT:/change-password");
    expect(mocks.redirect).toHaveBeenCalledWith("/change-password");
  });

  it("surfaces database and unknown failures so Next.js returns 500", async () => {
    const failure = new Error("database unavailable");
    mocks.requireFullSession.mockRejectedValue(failure);

    await expect(
      ProtectedLayout({ children: <div>content</div> }),
    ).rejects.toBe(failure);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
