import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock("@/lib/line-link-service", () => ({ completeLineLinkChallenge: mocks.complete }));
import { POST } from "./route";

const destination = `U${"b".repeat(32)}`;
const userId = `U${"a".repeat(32)}`;
const token = "x".repeat(43);

/** ลงลายเซ็น fixture บน bytes จริงเพื่อจับการ parse/serialize ก่อนตรวจ HMAC */
function request(payload: unknown, options: { signature?: string; length?: string } = {}) {
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
  const headers: Record<string, string> = { "x-line-signature": options.signature ?? createHmac("sha256", "test-secret").update(raw).digest("base64") };
  if (options.length) headers["content-length"] = options.length;
  return new Request("https://fitness.example/api/line/webhook", { method: "POST", headers, body: raw });
}
/** สร้าง relevant event; เปลี่ยนเพียง field ที่แต่ละกรณีต้องการทดสอบ */
function event(text = `LINK ${token}`) { return { type: "message", source: { type: "user", userId }, message: { type: "text", text } }; }

beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("NOTIFICATION_LINE_CHANNEL_SECRET", "test-secret"); vi.stubEnv("NOTIFICATION_LINE_DESTINATION", ""); mocks.complete.mockResolvedValue(true); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("signed LINE webhook", () => {
  it("fails closed without secret and does not attempt a claim", async () => {
    vi.stubEnv("NOTIFICATION_LINE_CHANNEL_SECRET", "");
    expect((await POST(request({ destination, events: [] }))).status).toBe(503); expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("checks signature before parsing malformed JSON and rejects byte tampering", async () => {
    expect((await POST(request("{", { signature: "invalid" }))).status).toBe(401);
    expect((await POST(request("{"))).status).toBe(400);
    const raw = JSON.stringify({ destination, events: [] });
    const signature = createHmac("sha256", "test-secret").update(raw).digest("base64");
    expect((await POST(request(`${raw} `, { signature }))).status).toBe(401);
    const absent = new Request("https://example.test/api/line/webhook", { method: "POST", body: raw });
    expect((await POST(absent)).status).toBe(401); expect(mocks.complete).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, { destination: "bad", events: [] }, { destination, events: null }])("rejects malformed envelope %j", async envelope => {
    expect((await POST(request(envelope))).status).toBe(400);
  });
  it("enforces configured destination and accepts empty events without Origin", async () => {
    expect((await POST(request({ destination, events: [] }))).status).toBe(200);
    vi.stubEnv("NOTIFICATION_LINE_DESTINATION", `U${"c".repeat(32)}`);
    expect((await POST(request({ destination, events: [] }))).status).toBe(400);
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it.each([undefined, "1", "262145"])("rejects oversized body with length %s without claiming", async length => {
    const response = await POST(request("a".repeat(262145), { length }));
    expect(response.status).toBe(413); expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("ignores unsupported/malformed events, processes relevant payload order and never calls a provider", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const second = "y".repeat(43);
    const response = await POST(request({ destination, events: [null, {}, { type: "follow" }, event(), { ...event(), source: { type: "group", userId } }, event(`LINK ${second}`)] }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true });
    expect(mocks.complete.mock.calls).toEqual([[token, userId], [second, userId]]); expect(fetch).not.toHaveBeenCalled();
  });
  it("acknowledges unknown/expired/rotated/consumed/duplicate claims with identical no-op response", async () => {
    mocks.complete.mockResolvedValue(false);
    const response = await POST(request({ destination, events: [event()] }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true });
  });
  it("returns generic 500 on infrastructure failure without leaking identifiers and preserves earlier event commit", async () => {
    const committed: string[] = [];
    mocks.complete.mockImplementation(async (value: string) => { if (value === token) committed.push(value); else throw new Error(`PRIVATE_DB_${userId}`); });
    const response = await POST(request({ destination, events: [event(), event(`LINK ${"y".repeat(43)}`), event(`LINK ${"z".repeat(43)}`)] }));
    expect(response.status).toBe(500); expect(await response.text()).not.toMatch(/PRIVATE_DB|Uaaaa|xxxxx/);
    expect(committed).toEqual([token]); expect(mocks.complete).toHaveBeenCalledTimes(2);
  });
});
