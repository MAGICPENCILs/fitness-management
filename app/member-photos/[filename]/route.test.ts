import path from "path";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn(), transaction: vi.fn(), select: vi.fn() }));
vi.mock("fs/promises", () => ({ mkdir: async () => undefined, unlink: async () => undefined, readFile: mocks.readFile, writeFile: mocks.writeFile }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction, select: mocks.select } }));
vi.mock("@/lib/privacy-service", () => ({ getMemberConsentSnapshot: async () => ({ current: { PHOTO: true } }) }));
vi.mock("@/lib/branch-service", () => ({ getCurrentBranchId: async () => 10 }));
vi.mock("@/lib/staff-service", () => ({ requirePermission: async () => ({ staffId: 2, role: "COUNTER", homeBranchId: 10 }), AuthorizationError: class extends Error {} }));

import { GET } from "@/app/member-photos/[filename]/route";
import { POST } from "@/app/api/upload/route";

const files = new Map<string, Buffer>();
const filename = `${"a".repeat(64)}.png`;

/** เรียก handler เดิมซ้ำโดยไม่ restart เพื่อพิสูจน์ว่าไฟล์ใหม่ไม่อาศัย public snapshot */
function getPhoto(name = filename) {
  return GET(new Request(`https://fitness.example/member-photos/${name}`), { params: Promise.resolve({ filename: name }) });
}

beforeEach(() => {
  vi.resetAllMocks(); files.clear();
  vi.stubEnv("APP_ORIGIN", "https://fitness.example");
  mocks.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }));
  mocks.readFile.mockImplementation(async (filePath: string) => {
    if (!files.has(filePath)) throw Object.assign(new Error("PRIVATE_PATH"), { code: "ENOENT" });
    return files.get(filePath);
  });
  mocks.writeFile.mockImplementation(async (filePath: string, bytes: Buffer) => { files.set(filePath, bytes); });
  mocks.transaction.mockImplementation(async (callback) => callback({
    select: () => ({ from: () => ({ where: () => ({ limit: () => ({ for: async () => [{ id: 7, homeBranchId: 10, status: "ACTIVE", photoUrl: null }] }) }) }) }),
    update: () => ({ set: () => ({ where: async () => [{ affectedRows: 1 }] }) }),
    insert: () => ({ values: async () => undefined }),
  }));
});

it("serves GET after successful POST in the same running handler without restart", async () => {
  expect((await getPhoto()).status).toBe(404);
  const body = new FormData();
  const bytes = Buffer.from("89504e470d0a1a0a", "hex");
  body.append("memberId", "7"); body.append("file", new File([bytes], "ignored.php", { type: "image/png" }));
  const upload = await POST(new Request("https://fitness.example/api/upload", { method: "POST", headers: { origin: "https://fitness.example" }, body }));
  expect(upload.status).toBe(200);
  const { url } = await upload.json();
  expect(url).toMatch(/^\/member-photos\/[a-f0-9]{64}\.png$/);
  const photo = await getPhoto(path.basename(url));
  expect(photo.status).toBe(200);
  expect(Buffer.from(await photo.arrayBuffer())).toEqual(bytes);
  expect(photo.headers.get("content-type")).toBe("image/png");
  expect(photo.headers.get("x-content-type-options")).toBe("nosniff");
  expect(photo.headers.get("cache-control")).toBe("private, no-store");
});

it.each([["jpg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"]])("serves %s with the matching content type", async (extension, contentType) => {
  const name = `${"b".repeat(64)}.${extension}`;
  files.set(path.join(process.cwd(), "public", "uploads", "members", name), Buffer.from("bytes"));
  const response = await getPhoto(name);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe(contentType);
});

it.each(["../secret.txt", "..\\secret.txt", "legacy-code.png", `${"a".repeat(64)}.svg`, `${"a".repeat(64)}.png.exe`])("rejects unsafe/non-opaque filename %s without filesystem access", async (name) => {
  expect((await getPhoto(name)).status).toBe(404);
  expect(mocks.readFile).not.toHaveBeenCalled();
});

it("returns fixed errors without raw filesystem details", async () => {
  const missing = await getPhoto();
  expect(missing.status).toBe(404);
  expect(await missing.json()).toEqual({ error: "ไม่พบรูปสมาชิก" });
  mocks.readFile.mockRejectedValue(new Error("PRIVATE_PATH_SQL"));
  const failed = await getPhoto();
  expect(failed.status).toBe(500);
  expect(await failed.json()).toEqual({ error: "อ่านรูปสมาชิกไม่สำเร็จ" });
});
