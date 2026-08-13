// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getSecurityDashboard: vi.fn(),
  getBranchContext: vi.fn(),
}));

vi.mock("@/lib/staff-service", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/auth/security-service", () => ({ getSecurityDashboard: mocks.getSecurityDashboard }));
vi.mock("@/lib/branch-service", () => ({ getBranchContext: mocks.getBranchContext }));
vi.mock("@/components/security/security-console", () => ({
  SecurityConsole: ({ filters }: { filters: Record<string, unknown> }) => (
    <output aria-label="security filters">{JSON.stringify(filters)}</output>
  ),
}));

import SecuritySettingsPage from "@/app/(protected)/settings/security/page";

describe("SecuritySettingsPage", () => {
  beforeEach(() => {
    mocks.requirePermission.mockResolvedValue({ staffId: 1, role: "OWNER", homeBranchId: 1 });
    mocks.getSecurityDashboard.mockResolvedValue({ sessions: {}, limits: {}, events: {} });
    mocks.getBranchContext.mockResolvedValue({ branches: [{ id: 1, name: "สำนักงานใหญ่" }] });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("บังคับ auth.security.read และแปลง URL state ก่อน query dashboard", async () => {
    render(
      await SecuritySettingsPage({
        searchParams: Promise.resolve({
          tab: "events",
          page: "2",
          branchId: "3",
          staffId: "7",
          action: "login_failed",
          result: "FAILED",
          from: "2026-08-01",
          to: "2026-08-10",
        }),
      }),
    );
    expect(mocks.requirePermission).toHaveBeenCalledWith("auth.security.read");
    expect(mocks.getSecurityDashboard).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: 1 }),
      expect.objectContaining({
        page: 2,
        pageSize: 20,
        branchId: 3,
        staffId: 7,
        action: "LOGIN_FAILED",
        result: "FAILED",
        from: expect.any(Date),
        to: expect.any(Date),
      }),
    );
    expect(screen.getByLabelText("security filters")).toHaveTextContent('"tab":"events"');
  });

  it("ลดรูป page/id/tab/date ที่ไม่ถูกต้องเป็นค่าเริ่มต้นปลอดภัย", async () => {
    await SecuritySettingsPage({
      searchParams: Promise.resolve({
        tab: "unknown",
        page: "1.5",
        branchId: "-2",
        staffId: "Infinity",
        from: "2026-02-30",
      }),
    });
    expect(mocks.getSecurityDashboard).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        page: 1,
        branchId: undefined,
        staffId: undefined,
        from: undefined,
      }),
    );
  });
});
