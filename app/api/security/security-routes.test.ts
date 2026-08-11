import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  assertTrustedOrigin: vi.fn(),
  getSecurityDashboard: vi.fn(),
  revokeSecuritySession: vi.fn(),
  revokeStaffSessions: vi.fn(),
  clearLoginLimit: vi.fn(),
}));

vi.mock("@/lib/staff-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/staff-service")>("@/lib/staff-service");
  return { ...actual, requirePermission: mocks.requirePermission };
});
vi.mock("@/lib/auth/request-security", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/request-security")>("@/lib/auth/request-security");
  return { ...actual, assertTrustedOrigin: mocks.assertTrustedOrigin };
});
vi.mock("@/lib/auth/security-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/security-service")>("@/lib/auth/security-service");
  return {
    ...actual,
    getSecurityDashboard: mocks.getSecurityDashboard,
    revokeSecuritySession: mocks.revokeSecuritySession,
    revokeStaffSessions: mocks.revokeStaffSessions,
    clearLoginLimit: mocks.clearLoginLimit,
  };
});

import { GET } from "@/app/api/security/route";
import { POST as revokeSession } from "@/app/api/security/sessions/[id]/revoke/route";
import { POST as revokeStaff } from "@/app/api/security/staff/[id]/revoke/route";
import { POST as clearLimit } from "@/app/api/security/rate-limits/[id]/clear/route";
import { SecurityOperationError } from "@/lib/auth/security-service";
import { AuthorizationError } from "@/lib/staff-service";

const actor = { staffId: 1, role: "OWNER" as const, homeBranchId: 1 };
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("security API routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.requirePermission.mockResolvedValue(actor);
    mocks.getSecurityDashboard.mockResolvedValue({ sessions: {}, limits: {}, events: {} });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET บังคับ auth.security.read และแปลง pagination/date filters ก่อนเรียก service", async () => {
    const response = await GET(new Request("https://fitness.example/api/security?page=2&pageSize=10&branchId=2&from=2026-08-01&to=2026-08-10"));
    expect(response.status).toBe(200);
    expect(mocks.requirePermission).toHaveBeenCalledWith("auth.security.read", undefined, expect.any(Object));
    expect(mocks.getSecurityDashboard).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ page: 2, pageSize: 10, branchId: 2, from: expect.any(Date), to: expect.any(Date) }),
    );
  });

  it("GET ปฏิเสธ page size และวันที่ไม่ถูกต้องด้วย 400 โดยไม่แตะ service", async () => {
    const response = await GET(new Request("https://fitness.example/api/security?pageSize=101&from=not-a-date"));
    expect(response.status).toBe(400);
    expect(mocks.getSecurityDashboard).not.toHaveBeenCalled();
  });

  it.each([
    [revokeSession, mocks.revokeSecuritySession],
    [revokeStaff, mocks.revokeStaffSessions],
    [clearLimit, mocks.clearLoginLimit],
  ])("POST mutation ตรวจ Origin, permission และ positive id", async (handler, service) => {
    const response = await handler(
      new Request("https://fitness.example/api/security/action", { method: "POST" }),
      params("7"),
    );
    expect(response.status).toBe(200);
    expect(mocks.assertTrustedOrigin).toHaveBeenCalledOnce();
    expect(mocks.requirePermission).toHaveBeenCalledWith("auth.security.manage", undefined, expect.any(Object));
    expect(service).toHaveBeenCalledWith(actor, 7);
  });

  it("POST ปฏิเสธ id ไม่ถูกต้องด้วย 400", async () => {
    const response = await revokeSession(
      new Request("https://fitness.example/api/security/sessions/nope/revoke", { method: "POST" }),
      params("nope"),
    );
    expect(response.status).toBe(400);
    expect(mocks.revokeSecuritySession).not.toHaveBeenCalled();
  });

  it("POST แปลง untrusted Origin เป็น 403 โดยไม่เปิดเผยรายละเอียด", async () => {
    mocks.assertTrustedOrigin.mockImplementation(() => { throw new Error("Untrusted origin"); });
    const response = await clearLimit(
      new Request("https://fitness.example/api/security/rate-limits/3/clear", { method: "POST" }),
      params("3"),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "ไม่สามารถดำเนินการได้" });
  });

  it("routes คง 401/403 จาก guard และ 404 จาก service", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new AuthorizationError("กรุณาเข้าสู่ระบบ", 401));
    expect((await GET(new Request("https://fitness.example/api/security"))).status).toBe(401);

    mocks.clearLoginLimit.mockRejectedValueOnce(new SecurityOperationError("ไม่พบ rate limit", 404));
    const response = await clearLimit(
      new Request("https://fitness.example/api/security/rate-limits/99/clear", { method: "POST" }),
      params("99"),
    );
    expect(response.status).toBe(404);
  });

  it("unexpected error ตอบข้อความกลางโดยไม่คืนรายละเอียดฐานข้อมูล", async () => {
    mocks.revokeStaffSessions.mockRejectedValueOnce(new Error("SQL secret detail"));
    const response = await revokeStaff(
      new Request("https://fitness.example/api/security/staff/3/revoke", { method: "POST" }),
      params("3"),
    );
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("SQL secret detail");
  });
});
