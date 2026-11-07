import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), mutate: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/branch-service", () => ({ getCurrentBranchId: async () => 10 }));
vi.mock("@/lib/staff-service", () => ({ requirePermission: mocks.permission, AuthorizationError: class extends Error {} }));
vi.mock("@/lib/audit-service", () => ({ runAuditedMutation: mocks.mutate }));
import { POST } from "@/app/api/members/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.permission.mockResolvedValue({ staffId: 2 });
});

it.each(["/uploads/members/shared.png", "/member-photos/opaque.png", "https://other.example/private.jpg"])("rejects client-supplied photoUrl %s at creation", async (photoUrl) => {
  const response = await POST(new Request("https://fitness.example/api/members", { method: "POST", body: JSON.stringify({ memberCode: "M7", firstName: "Test", lastName: "Member", photoUrl, consents: { servicePrivacy: true, photo: true, policyVersion: "2026-11" } }) }));
  expect(response.status).toBe(400);
  expect(mocks.mutate).not.toHaveBeenCalled();
});

it("still creates a member without a client photo", async () => {
  let saved: Record<string, unknown> | undefined;
  mocks.mutate.mockImplementation(async (_context, callback) => callback({ insert: () => ({ values: async (value: Record<string, unknown>) => { if (!Array.isArray(value)) saved = value; return [{ insertId: 7 }]; } }) }));
  const response = await POST(new Request("https://fitness.example/api/members", { method: "POST", body: JSON.stringify({ memberCode: "M7", firstName: "Test", lastName: "Member", consents: { servicePrivacy: true, policyVersion: "2026-11" } }) }));
  expect(response.status).toBe(201);
  expect(saved).not.toHaveProperty("photoUrl");
});
