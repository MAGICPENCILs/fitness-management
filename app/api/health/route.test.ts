import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSystemReadiness: vi.fn(),
}));

vi.mock("@/lib/system-readiness", () => ({
  getSystemReadiness: mocks.getSystemReadiness,
}));

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("คืน 200 เมื่อ database และ schema พร้อม", async () => {
    mocks.getSystemReadiness.mockResolvedValue({
      status: "READY",
      requiredMigration: "0016_add_staff_workforce",
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      checks: { database: "ok", schema: "ok" },
    });
  });

  it("คืน 503 พร้อม migration tag เมื่อ schema ล้าสมัย", async () => {
    mocks.getSystemReadiness.mockResolvedValue({
      status: "OUTDATED",
      requiredMigration: "0016_add_staff_workforce",
    });

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: "degraded",
      checks: { database: "ok", schema: "outdated" },
      requiredMigration: "0016_add_staff_workforce",
    });
  });

  it("คืน 503 แบบปลอดภัยเมื่อ database ติดต่อไม่ได้", async () => {
    mocks.getSystemReadiness.mockResolvedValue({
      status: "UNAVAILABLE",
      requiredMigration: "mysql://secret@internal/fitness_db",
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      status: "unavailable",
      checks: { database: "unavailable", schema: "unknown" },
    });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.stringify(body)).not.toContain("fitness_db");
  });
});
