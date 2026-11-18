import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/lib/staff-service";
import { LineProviderSettingsError } from "@/lib/line-provider-settings-service";
import { GET, PATCH } from "./route";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), get: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/staff-service", async original => ({ ...await original<typeof import("@/lib/staff-service")>(), requirePermission: mocks.authorize }));
vi.mock("@/lib/line-provider-settings-service", async original => ({ ...await original<typeof import("@/lib/line-provider-settings-service")>(),
  getLineProviderSettingsDto: mocks.get, updateLineProviderSettings: mocks.update }));
const actor = { staffId: 3, role: "OWNER", homeBranchId: 1 };
const origin = "https://fitness.example";
const dto = { revision: 1, destination: `U${"a".repeat(32)}`, source: "DATABASE", accessTokenConfigured: true, channelSecretConfigured: true,
  updatedAt: "2026-11-09T00:00:00.000Z", webhookUrl: origin + "/api/line/webhook", outboundEnabled: false };

/** ใช้ Request จริงเพื่อให้ bodyUsed บอกได้ว่าการปฏิเสธเกิดก่อนอ่าน credential */
function request(body: string, from = origin, length?: string) {
  return new Request(origin + "/api/notification-provider-settings", { method: "PATCH", body,
    headers: { origin: from, "content-type": "application/json", ...(length ? { "content-length": length } : {}) } });
}

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("APP_ORIGIN", origin);
  mocks.authorize.mockImplementation(async permission => {
    if (permission !== "provider.credentials.manage") throw new Error("wrong permission");
    return actor;
  });
  mocks.get.mockResolvedValue(dto); mocks.update.mockResolvedValue(dto);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("Owner LINE provider API", () => {
  it("checks both permissions and sends uncached safe DTOs", async () => {
    const value = { revision: 0, destination: dto.destination, accessToken: "fresh", clearChannelSecret: true };
    for (const res of [await GET(), await PATCH(request(JSON.stringify(value)))]) {
      expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(await res.json()).toEqual(dto);
    }
    expect(mocks.get).toHaveBeenCalledWith(actor); expect(mocks.update).toHaveBeenCalledWith(actor, value);
  });
  it.each([401, 403] as const)("denies %i before reading a body or accessing config", async status => {
    mocks.authorize.mockRejectedValue(new AuthorizationError("PRIVATE_AUTH_DETAIL", status));
    const req = request("{");
    for (const res of [await GET(), await PATCH(req)]) {
      expect(res.status).toBe(status); expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(await res.text()).not.toContain("PRIVATE");
    }
    expect(req.bodyUsed).toBe(false);
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(["", "https://elsewhere.test"])("denies absent or wrong Origin before auth/body/config", async from => {
    const req = request("{", from); const res = await PATCH(req);
    expect(res.status).toBe(403); expect(req.bodyUsed).toBe(false); expect(mocks.authorize).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
  it.each([[request("{PRIVATE"), 400], [request("a".repeat(262145), origin, "1"), 413]])("bounds and validates body before service", async (req, status) => {
    const res = await PATCH(req); expect(res.status).toBe(status);
    expect(res.headers.get("cache-control")).toBe("private, no-store"); expect(await res.text()).not.toContain("PRIVATE");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not return or log raw errors, even if storage throws a secret-bearing error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.get.mockRejectedValue(new Error("PRIVATE_DB_FAILURE")); mocks.update.mockRejectedValue(new LineProviderSettingsError(409));
    const read = await GET(); expect(read.status).toBe(503); expect(await read.text()).not.toContain("PRIVATE");
    const write = await PATCH(request("{}")); expect(write.status).toBe(409); expect(log).not.toHaveBeenCalled();
    for (const res of [read, write]) expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
