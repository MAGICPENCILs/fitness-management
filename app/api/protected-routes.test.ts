import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getCurrentBranchId: vi.fn(),
  getAccountingSnapshot: vi.fn(),
  dbSelect: vi.fn(),
}));

vi.mock("@/lib/staff-service", () => ({
  AuthorizationError: class AuthorizationError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/branch-service", () => ({
  getCurrentBranchId: mocks.getCurrentBranchId,
}));
vi.mock("@/lib/accounting", () => ({
  getAccountingSnapshot: mocks.getAccountingSnapshot,
}));
vi.mock("@/db", () => ({
  db: { select: mocks.dbSelect },
}));
vi.mock("@/lib/audit-service", () => ({ runAuditedMutation: vi.fn() }));
vi.mock("@/lib/consent-policy", () => ({ canCreateMember: vi.fn() }));

import { GET as accountingGet } from "@/app/api/accounting/route";
import { GET as accountingExportGet } from "@/app/api/accounting/export/route";
import { GET as membersGet } from "@/app/api/members/route";
import { GET as nextMemberCodeGet } from "@/app/api/members/next-code/route";
import { AuthorizationError } from "@/lib/staff-service";

const ACCOUNTING_REQUEST = new Request(
  "https://fitness.example/api/accounting?from=2026-08-01&to=2026-08-11",
);

/** เรียก Route Handler จริงโดยไม่ผ่าน Proxy เพื่อพิสูจน์ว่า server guard เป็น boundary ที่บังคับใช้เอง */
async function callProtectedRoutes() {
  return [
    await accountingGet(ACCOUNTING_REQUEST),
    await accountingExportGet(ACCOUNTING_REQUEST),
    await membersGet(),
    await nextMemberCodeGet(),
  ];
}

describe("authoritative protected Route Handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentBranchId.mockResolvedValue(2);
  });

  it.each([
    [401, "กรุณาเข้าสู่ระบบ"],
    [403, "บัญชีนี้ไม่มีสิทธิ์ดำเนินการ"],
  ] as const)("returns %s before any protected data query", async (status, message) => {
    mocks.requirePermission.mockRejectedValue(
      new AuthorizationError(message, status),
    );

    const responses = await callProtectedRoutes();

    expect(responses.map((response) => response.status)).toEqual([
      status,
      status,
      status,
      status,
    ]);
    expect(mocks.getAccountingSnapshot).not.toHaveBeenCalled();
    expect(mocks.dbSelect).not.toHaveBeenCalled();
  });
});
