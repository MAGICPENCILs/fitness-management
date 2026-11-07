import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ branch: vi.fn(), permission: vi.fn(), save: vi.fn(), audited: vi.fn(), write: vi.fn(), mkdir: vi.fn(), writeAudit: vi.fn() }));
vi.mock("@/lib/branch-service", () => ({ getCurrentBranchId: mocks.branch }));
vi.mock("@/lib/staff-service", () => ({
  requirePermission: mocks.permission,
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message: string, public status: 401 | 403) { super(message); }
  },
}));
vi.mock("@/lib/member-photo-service", async (importOriginal) => ({ ...await importOriginal<object>(), saveMemberPhoto: mocks.save }));
vi.mock("@/lib/privacy-service", () => ({ getMemberConsentSnapshot: vi.fn() }));
vi.mock("@/lib/audit-service", () => ({ runAuditedMutation: mocks.audited, writeAudit: mocks.writeAudit }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("fs/promises", () => ({ writeFile: mocks.write, mkdir: mocks.mkdir, unlink: vi.fn() }));

import { POST } from "@/app/api/upload/route";
import { PATCH } from "@/app/api/members/[id]/route";
import { AuthorizationError } from "@/lib/staff-service";
import { MemberPhotoError } from "@/lib/member-photo-service";

const actor = { staffId: 2, role: "COUNTER", homeBranchId: 10 };

/** สร้าง multipart จริงเพื่อทดสอบ boundary โดยไม่เชื่อรูปแบบค่าที่ client ส่งมา */
function request(memberId: string | File | null = "7", file: string | File | null = new File(["image"], "../../unsafe.php", { type: "image/png" }), origin: string | null = "https://fitness.example") {
  const body = new FormData();
  if (memberId !== null) body.append("memberId", memberId);
  if (file !== null) body.append("file", file);
  return new Request("https://fitness.example/api/upload", { method: "POST", headers: origin ? { origin } : {}, body });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_ORIGIN", "https://fitness.example");
  mocks.branch.mockResolvedValue(10);
  mocks.permission.mockResolvedValue(actor);
  mocks.save.mockResolvedValue({ url: "/uploads/members/saved.png" });
});

describe("photo upload HTTP contract", () => {
  it.each([null, "https://evil.example"])("rejects Origin %s before branch/auth/body", async (origin) => {
    const req = request("7", null, origin);
    const body = vi.spyOn(req, "formData");
    const response = await POST(req);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "คำขอไม่ผ่านการตรวจสอบความปลอดภัย" });
    expect(mocks.branch).not.toHaveBeenCalled();
    expect(mocks.permission).not.toHaveBeenCalled();
    expect(body).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it.each([null, "", "0", "-1", "1.5", "9007199254740992", "NaN", "1e0", new File(["7"], "id.txt")])("rejects malformed memberId %s", async (memberId) => {
    const response = await POST(request(memberId));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "ข้อมูลอัปโหลดไม่ถูกต้อง" });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each([null, "not a file"])("rejects invalid file %s", async (file) => {
    const response = await POST(request("7", file));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "ข้อมูลอัปโหลดไม่ถูกต้อง" });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed multipart without internal details", async () => {
    const response = await POST(new Request("https://fitness.example/api/upload", { method: "POST", headers: { origin: "https://fitness.example", "Content-Type": "multipart/form-data; boundary=bad" }, body: "PRIVATE_BODY" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "ข้อมูลอัปโหลดไม่ถูกต้อง" });
  });

  it.each([401, 403] as const)("preserves authorization status %s before parsing", async (status) => {
    mocks.permission.mockRejectedValue(new AuthorizationError("PRIVATE_AUTH", status));
    const req = request(); const body = vi.spyOn(req, "formData");
    const response = await POST(req);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "ไม่มีสิทธิ์อัปโหลดรูปสมาชิก" });
    expect(body).not.toHaveBeenCalled();
  });

  it("calls one authorized mutation with memberId and file, ignoring memberCode", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "/uploads/members/saved.png" });
    expect(mocks.permission).toHaveBeenCalledWith("members.manage", 10, { action: "MEMBER_PHOTO_UPDATED", entityType: "MEMBER" });
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ actor, branchId: 10, memberId: 7, file: expect.any(File) });
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it.each([400, 403, 404])("returns safe business error status %s", async (status) => {
    mocks.save.mockRejectedValue(new MemberPhotoError("ไฟล์รูปไม่ถูกต้อง", status));
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "ไฟล์รูปไม่ถูกต้อง" });
  });

  it("returns fixed 500 without logging raw filesystem or SQL errors", async () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.save.mockRejectedValue(new Error("PRIVATE_PATH_SQL"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "อัปโหลดรูปไม่สำเร็จ" });
    expect(JSON.stringify(logger.mock.calls)).not.toContain("PRIVATE_PATH_SQL");
    logger.mockRestore();
  });
});

it("generic member PATCH cannot set photoUrl or include photo in its audit", async () => {
  let changes: unknown;
  mocks.audited.mockImplementation(async (_context, callback) => callback({ update: () => ({ set: (input: unknown) => { changes = input; return { where: async () => [{ affectedRows: 1 }] }; } }) }));
  const response = await PATCH(new Request("https://fitness.example/api/members/7", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstName: "Test", photoUrl: "/unsafe.svg" }) }), { params: Promise.resolve({ id: "7" }) });
  expect(response.status).toBe(200);
  expect(changes).toMatchObject({ firstName: "Test" });
  expect(changes).not.toHaveProperty("photoUrl");
  expect(mocks.audited.mock.calls[0][0].metadata.fields).not.toContain("photoUrl");
});
