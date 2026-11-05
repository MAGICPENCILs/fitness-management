import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentBranchId: vi.fn(), requirePermission: vi.fn(), getAdvancedReports: vi.fn(), exportReportCsv: vi.fn(),
}));

vi.mock("@/lib/branch-service", () => ({ getCurrentBranchId: mocks.getCurrentBranchId }));
vi.mock("@/lib/staff-service", () => ({ requirePermission: mocks.requirePermission, AuthorizationError: class extends Error {} }));
vi.mock("@/lib/reports", () => ({ getAdvancedReports: mocks.getAdvancedReports, exportReportCsv: mocks.exportReportCsv }));

import { GET } from "./route";

describe("GET /api/reports/export", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.getCurrentBranchId.mockResolvedValue(4);
    mocks.getAdvancedReports.mockResolvedValue({ period: { from: "2026-11-01", to: "2026-11-30" } });
    mocks.exportReportCsv.mockReturnValue("csv");
  });

  it("ส่ง branch และช่วงวันแบบ exclusive ให้ report service", async () => {
    const response = await GET(new Request("http://localhost:3005/api/reports/export?type=vat&from=2026-11-01&to=2026-11-30"));
    expect(response.status).toBe(200);
    expect(mocks.requirePermission).toHaveBeenCalledWith("audit.read", 4);
    expect(mocks.getAdvancedReports).toHaveBeenCalledWith(4, expect.objectContaining({ start: new Date("2026-11-01T00:00:00"), endExclusive: new Date("2026-12-01T00:00:00") }));
  });
});
