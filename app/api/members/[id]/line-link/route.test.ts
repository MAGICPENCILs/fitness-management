import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), get: vi.fn(), issue: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/staff-service", async importOriginal => {
  const original = await importOriginal<typeof import("@/lib/staff-service")>();
  return { ...original, requirePermission: mocks.permission };
});
vi.mock("@/lib/line-link-service", async importOriginal => {
  const original = await importOriginal<typeof import("@/lib/line-link-service")>();
  return { ...original, getLineLinkStatus: mocks.get, issueLineLinkChallenge: mocks.issue, removeLineLink: mocks.remove };
});
vi.mock("@/db", () => ({ db: {} }));
import { AuthorizationError } from "@/lib/staff-service";
import { LineLinkError } from "@/lib/line-link-policy";
import { DELETE, GET, POST } from "./route";

const actor = { staffId: 3, role: "COUNTER", homeBranchId: 10 };
const unlinked = { status: "UNLINKED", challengeExpiresAt: null, linkedAt: null };
const context = { params: Promise.resolve({ id: "7" }) };
/** ใช้ request จริงเพื่อทดสอบ Origin และปฏิเสธ input ที่พยายามกำหนด LINE ID */
function request(method = "GET", body?: string, origin: string | null = "https://fitness.example") {
  return new Request("https://fitness.example/api/members/7/line-link?branchId=999", { method, headers: origin === null ? {} : { origin }, body });
}
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("APP_ORIGIN", "https://fitness.example"); mocks.permission.mockResolvedValue(actor); mocks.get.mockResolvedValue(unlinked); mocks.issue.mockResolvedValue({ ...unlinked, status: "PENDING", command: `LINK ${"a".repeat(43)}` }); mocks.remove.mockResolvedValue(unlinked); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("staff LINE link API", () => {
  it("uses authoritative permission and delegates resource branch checks to service instead of client branch", async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200); expect(await response.json()).toEqual(unlinked);
    expect(mocks.permission).toHaveBeenCalledWith("members.manage"); expect(mocks.get).toHaveBeenCalledWith(actor, 7);
  });
  it("returns once-only command on issuance and no command on GET or DELETE", async () => {
    expect(await (await POST(request("POST"), context)).json()).toMatchObject({ command: `LINK ${"a".repeat(43)}` });
    expect(await (await GET(request(), context)).json()).toEqual(unlinked);
    expect(await (await DELETE(request("DELETE"), context)).json()).toEqual(unlinked);
  });
  it.each([POST, DELETE])("requires trusted Origin for mutation", async handler => {
    const method = handler === POST ? "POST" : "DELETE";
    for (const origin of [null, "https://evil.example"]) expect((await handler(request(method, undefined, origin), context)).status).toBe(403);
    expect(mocks.issue).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it.each([POST, DELETE])("rejects raw-ID and branch injection, nonempty or malformed payloads", async handler => {
    for (const body of [JSON.stringify({ lineUserId: `U${"a".repeat(32)}` }), '{"branchId":999}', "null", "[]", "{"]) expect((await handler(request(handler === POST ? "POST" : "DELETE", body), context)).status).toBe(400);
    expect(mocks.issue).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it.each([401, 403] as const)("propagates authoritative session denial %s", async status => {
    mocks.permission.mockRejectedValue(new AuthorizationError("denied", status));
    for (const [handler, method] of [[GET, "GET"], [POST, "POST"], [DELETE, "DELETE"]] as const) expect((await handler(request(method), context)).status).toBe(status);
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.issue).not.toHaveBeenCalled();
  });
  it("returns fixed LINKED conflict and hides infrastructure details", async () => {
    mocks.issue.mockRejectedValue(new LineLinkError("สมาชิกเชื่อมต่อ LINE แล้ว กรุณายกเลิกก่อน", 409));
    expect((await POST(request("POST"), context)).status).toBe(409);
    mocks.issue.mockRejectedValue(new Error(`PRIVATE_DB_${"a".repeat(43)}`));
    const failure = await POST(request("POST"), context); expect(failure.status).toBe(500); expect(await failure.text()).not.toContain("PRIVATE_DB");
  });
  it("rejects malformed member IDs without reaching service", async () => {
    for (const id of ["0", "-1", "1.5", "NaN", "7junk"]) expect((await GET(request(), { params: Promise.resolve({ id }) })).status).toBe(400);
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
