import path from "path";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), select: vi.fn(), consent: vi.fn(), readFile: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/auth/session-service", () => ({ requireFullSession: mocks.session }));
vi.mock("@/lib/privacy-service", () => ({ getMemberConsentSnapshot: mocks.consent }));
vi.mock("fs/promises", () => ({ readFile: mocks.readFile }));

import { GET } from "@/app/member-photos/by-member/[id]/route";

const filename = `${"a".repeat(64)}.png`;
const privatePath = path.join(process.cwd(), "storage", "member-photos", filename);
const legacyPath = path.join(process.cwd(), "public", "uploads", "members", filename);
const files = new Map<string, Buffer>();
let row: { homeBranchId: number; status: string; photoUrl: string | null } | undefined;

/** เรียก gateway จริงโดยจำลองเฉพาะ session/ฐานข้อมูลและ filesystem ภายนอก */
function getPhoto(id = "7") {
  return GET(new Request(`https://fitness.example/member-photos/by-member/${id}`), { params: Promise.resolve({ id }) });
}

/** ทุกกรณีปฏิเสธต้องแยกสาเหตุจาก HTTP ไม่ได้และห้าม cache หรือ redirect */
async function expectHidden(response: Response) {
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "ไม่พบรูปสมาชิก" });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("location")).toBeNull();
}

beforeEach(() => {
  vi.resetAllMocks(); files.clear();
  row = { homeBranchId: 10, status: "ACTIVE", photoUrl: `/member-photos/${filename}` };
  mocks.session.mockResolvedValue({ staffId: 2, role: "COUNTER", homeBranchId: 10 });
  mocks.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => row ? [row] : [] }) }) }));
  mocks.consent.mockResolvedValue({ current: { PHOTO: true } });
  files.set(privatePath, Buffer.from("private image"));
  mocks.readFile.mockImplementation(async (filePath: string) => {
    if (!files.has(filePath)) throw Object.assign(new Error("PRIVATE_PATH"), { code: "ENOENT" });
    return files.get(filePath);
  });
});

it.each(["MISSING", "REVOKED", "EXPIRED", "INACTIVE_STAFF", "INACTIVE_BRANCH", "PASSWORD_CHANGE_REQUIRED", "MEMBER_COOKIE"])("hides %s staff session failure before reading member data", async (reason) => {
  mocks.session.mockRejectedValue(new Error(`SECRET_${reason}`));
  await expectHidden(await getPhoto());
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.readFile).not.toHaveBeenCalled();
});

it.each(["0", "-1", "1.2", "1e2", "9007199254740992", "abc", "7.png"])("rejects invalid member id %s without database or file access", async (id) => {
  await expectHidden(await getPhoto(id));
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.readFile).not.toHaveBeenCalled();
});

it.each([
  ["TRAINER", 10, 10, false], ["COUNTER", 20, 10, false], ["MANAGER", 20, 10, false],
  ["COUNTER", 10, 10, true], ["MANAGER", 10, 10, true], ["OWNER", 20, 10, true],
])("enforces live member branch for %s actor in branch %s", async (role, actorBranch, memberBranch, allowed) => {
  mocks.session.mockResolvedValue({ staffId: 2, role, homeBranchId: actorBranch });
  row!.homeBranchId = memberBranch as number;
  const response = await getPhoto();
  if (allowed) expect(response.status).toBe(200);
  else { await expectHidden(response); expect(mocks.readFile).not.toHaveBeenCalled(); }
});

it.each(["missing", "cancelled", "no reference", "invalid reference", "withdrawn", "no consent"])("hides %s without filesystem reads", async (state) => {
  if (state === "missing") row = undefined;
  if (state === "cancelled") row!.status = "CANCELLED";
  if (state === "no reference") row!.photoUrl = null;
  if (state === "invalid reference") row!.photoUrl = "/uploads/members/../secret.png";
  if (state === "withdrawn" || state === "no consent") mocks.consent.mockResolvedValue({ current: { PHOTO: state === "withdrawn" ? false : null } });
  await expectHidden(await getPhoto());
  expect(mocks.readFile).not.toHaveBeenCalled();
});

it.each(["private", "old opaque", "raw legacy"])("serves authorized %s bytes with private headers", async (source) => {
  if (source !== "private") { files.clear(); files.set(legacyPath, Buffer.from("private image")); }
  if (source === "raw legacy") row!.photoUrl = `/uploads/members/${filename}`;
  const response = await getPhoto();
  expect(response.status).toBe(200);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from("private image"));
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
});

it.each([["jpg", "image/jpeg"], ["webp", "image/webp"], ["jpeg", "image/jpeg"]])("serves legacy %s with safe content type", async (extension, mime) => {
  row!.photoUrl = `/uploads/members/OLD-001.${extension}`;
  files.set(path.join(process.cwd(), "public", "uploads", "members", `OLD-001.${extension}`), Buffer.from("old"));
  const response = await getPhoto();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe(mime);
});

it("fails closed when copies exist in both roots", async () => {
  files.set(legacyPath, Buffer.from("ambiguous"));
  await expectHidden(await getPhoto());
});

it("returns fixed unavailable response when every candidate is missing", async () => {
  files.clear();
  await expectHidden(await getPhoto());
});

it("does not fall back on a private I/O error or expose its details", async () => {
  files.set(legacyPath, Buffer.from("old"));
  mocks.readFile.mockRejectedValue(new Error("PRIVATE_PATH_SQL"));
  const response = await getPhoto();
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "อ่านรูปสมาชิกไม่สำเร็จ" });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(mocks.readFile).toHaveBeenCalledOnce();
});
