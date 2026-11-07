import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { members } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), insert: vi.fn(), select: vi.fn(), update: vi.fn(),
  mkdir: vi.fn(), writeFile: vi.fn(), unlink: vi.fn(), consent: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction, insert: mocks.insert } }));
vi.mock("fs/promises", () => ({ mkdir: mocks.mkdir, writeFile: mocks.writeFile, unlink: mocks.unlink }));
vi.mock("@/lib/privacy-service", () => ({ getMemberConsentSnapshot: mocks.consent }));

import { saveMemberPhoto } from "@/lib/member-photo-service";

const actor = { staffId: 2, role: "COUNTER" as const, homeBranchId: 10 };
const oldUrl = "/uploads/members/OLD-001.jpg";
const png = Buffer.from("89504e470d0a1a0a", "hex");
let row: { id: number; homeBranchId: number; status: string; photoUrl: string | null } | undefined;
let updates: unknown[];
let audits: Record<string, unknown>[];
let failUpdate: boolean;
let failAudit: boolean;
const tx = { select: mocks.select, update: mocks.update, insert: mocks.insert };

/** สร้างไฟล์ทดสอบที่จงใจไม่ใช้ชื่อนามสกุลเป็นตัวบอกชนิด */
function image(bytes = png, type = "image/png", name = "../../private.php") {
  return new File([new Uint8Array(bytes)], name, { type });
}

beforeEach(() => {
  vi.resetAllMocks();
  row = { id: 7, homeBranchId: 10, status: "ACTIVE", photoUrl: oldUrl };
  updates = []; audits = []; failUpdate = false; failAudit = false;
  mocks.mkdir.mockResolvedValue(undefined);
  mocks.writeFile.mockResolvedValue(undefined);
  mocks.unlink.mockResolvedValue(undefined);
  mocks.consent.mockResolvedValue({ current: { PHOTO: true } });
  mocks.transaction.mockImplementation(async (callback) => {
    const value = await callback(tx);
    return value;
  });
  mocks.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: () => ({ for: async () => row ? [row] : [] }) }) }) }));
  mocks.update.mockImplementation((table) => {
    expect(table).toBe(members);
    return { set: (changes: unknown) => ({ where: async () => {
      if (failUpdate) throw new Error("PRIVATE_SQL");
      updates.push(changes);
      return [{ affectedRows: 1 }];
    } }) };
  });
  mocks.insert.mockImplementation(() => ({ values: async (entry: Record<string, unknown>) => {
    if (failAudit && entry.result === "SUCCESS") throw new Error("PRIVATE_AUDIT_SQL");
    audits.push(entry);
  } }));
});

describe("saveMemberPhoto", () => {
  it.each([
    ["empty", Buffer.alloc(0), "image/png"],
    ["oversize", Buffer.alloc(5 * 1024 * 1024 + 1), "image/png"],
    ["SVG", Buffer.from("<svg/>"), "image/svg+xml"],
    ["spoofed PNG", Buffer.from("<script>bad</script>"), "image/png"],
    ["mismatched MIME", png, "image/jpeg"],
    ["truncated JPEG", Buffer.from("ffd8", "hex"), "image/jpeg"],
    ["spoofed WebP", Buffer.from("RIFF1234FAKE"), "image/webp"],
    ["inherited object MIME", Buffer.from("RIFF1234WEBP"), "constructor"],
    ["high-bit WebP spoof", Buffer.from("d2c9c6c600000000d7c5c2d0", "hex"), "image/webp"],
  ])("rejects %s without creating files or updating members", async (_label, bytes, mime) => {
    await expect(saveMemberPhoto({ actor, branchId: 10, memberId: 7, file: image(bytes, mime) })).rejects.toMatchObject({ status: 400 });
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid member id %s", async (memberId) => {
    await expect(saveMemberPhoto({ actor, branchId: 10, memberId, file: image() })).rejects.toMatchObject({ status: 400 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([undefined, { id: 7, homeBranchId: 20, status: "ACTIVE", photoUrl: oldUrl }, { id: 7, homeBranchId: 10, status: "CANCELLED", photoUrl: oldUrl }])("rejects unavailable members before filesystem writes", async (member) => {
    row = member;
    await expect(saveMemberPhoto({ actor, branchId: 10, memberId: 7, file: image() })).rejects.toMatchObject({ status: 404 });
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("rejects missing or withdrawn latest PHOTO consent", async () => {
    mocks.consent.mockResolvedValue({ current: { PHOTO: false } });
    await expect(saveMemberPhoto({ actor, branchId: 10, memberId: 7, file: image() })).rejects.toMatchObject({ status: 403 });
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it.each([{ ...actor, role: "TRAINER" as const }, { ...actor, homeBranchId: 20 }])("enforces actor permission and branch in service", async (deniedActor) => {
    await expect(saveMemberPhoto({ actor: deniedActor, branchId: 10, memberId: 7, file: image() })).rejects.toMatchObject({ status: 403 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    [png, "image/png", "png"],
    [Buffer.from("ffd8ffe000", "hex"), "image/jpeg", "jpg"],
    [Buffer.from("524946460400000057454250", "hex"), "image/webp", "webp"],
  ])("saves %s using server randomness and one audited update", async (bytes, mime, extension) => {
    const result = await saveMemberPhoto({ actor, branchId: 10, memberId: 7, file: image(bytes, mime) });
    expect(result.url).toMatch(new RegExp(`^/uploads/members/[a-f0-9]{64}\\.${extension}$`));
    expect(mocks.writeFile).toHaveBeenCalledWith(path.join(process.cwd(), "public", result.url), bytes, { flag: "wx" });
    expect(updates).toEqual([{ photoUrl: result.url }]);
    expect(audits).toEqual([{ actorStaffId: 2, branchId: 10, action: "MEMBER_PHOTO_UPDATED", entityType: "MEMBER", entityId: 7, result: "SUCCESS", metadata: { fields: ["photo"] } }]);
    expect(mocks.consent).toHaveBeenCalledWith(7, undefined, tx);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.unlink).toHaveBeenCalledWith(path.join(process.cwd(), "public", oldUrl));
    expect(mocks.unlink.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.insert.mock.invocationCallOrder[0]);
  });

  it("accepts exactly 5 MiB and creates different paths on repeated uploads", async () => {
    const bytes = Buffer.alloc(5 * 1024 * 1024); png.copy(bytes);
    const first = await saveMemberPhoto({ actor, branchId: 10, memberId: 7, file: image(bytes) });
    const second = await saveMemberPhoto({ actor, branchId: 10, memberId: 7, file: image() });
    expect(first.url).not.toBe(second.url);
  });

  it.each(["update", "audit", "commit"])("compensates the new file on %s failure, preserving the old file", async (stage) => {
    failUpdate = stage === "update"; failAudit = stage === "audit";
    if (stage === "commit") mocks.transaction.mockImplementation(async (callback) => { await callback(tx); throw new Error("PRIVATE_COMMIT"); });
    await expect(saveMemberPhoto({ actor, branchId: 10, memberId: 7, file: image() })).rejects.toThrow();
    expect(mocks.unlink).toHaveBeenCalledExactlyOnceWith(mocks.writeFile.mock.calls[0][0]);
    expect(mocks.unlink).not.toHaveBeenCalledWith(path.join(process.cwd(), "public", oldUrl));
  });

  it.each(["/uploads/members/../../secret.txt", "/uploads/members/..\\secret.txt", "/secret.txt", "https://other.example/photo.png"])("never unlinks unsafe old URL %s", async (photoUrl) => {
    row!.photoUrl = photoUrl;
    await saveMemberPhoto({ actor, branchId: 10, memberId: 7, file: image() });
    expect(mocks.unlink).not.toHaveBeenCalled();
  });

  it("keeps committed success and logs a fixed label if old cleanup fails", async () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.unlink.mockRejectedValue(new Error("PRIVATE_PATH_SQL"));
    await expect(saveMemberPhoto({ actor, branchId: 10, memberId: 7, file: image() })).resolves.toHaveProperty("url");
    expect(logger).toHaveBeenCalledExactlyOnceWith("MEMBER_PHOTO_CLEANUP_FAILED");
    logger.mockRestore();
  });
});
