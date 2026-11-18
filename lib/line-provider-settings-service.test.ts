import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notificationTestDb, queuedNotification } from "@/lib/notifications/notification-test-db";
import { decryptProviderCredential } from "@/lib/provider-credentials-crypto";
import { getLineProviderSettingsDto as get, updateLineProviderSettings as update, resolveLineWebhookCredentials as resolve } from "./line-provider-settings-service";

const mocks = vi.hoisted(() => ({ select: vi.fn(), transaction: vi.fn(), insert: vi.fn() }));
vi.mock("@/db", () => ({ db: mocks }));
const owner = { staffId: 2, role: "OWNER" as const, homeBranchId: 1 };
const destination = `U${"a".repeat(32)}`;
const other = `U${"b".repeat(32)}`;
const key = Buffer.alloc(32, 7).toString("base64");
const first = { revision: 0, destination, accessToken: "new-token", channelSecret: "new-secret" };
const now = new Date("2026-11-09T00:00:00Z");
let state: ReturnType<typeof notificationTestDb>["state"];

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now);
  const fixture = notificationTestDb();
  state = fixture.state; state.links = [];
  mocks.select.mockImplementation(fixture.db.select);
  mocks.transaction.mockImplementation(fixture.db.transaction);
  mocks.insert.mockImplementation(fixture.db.insert);
  vi.stubEnv("APP_ORIGIN", "https://fitness.example");
  vi.stubEnv("PROVIDER_CONFIG_ENCRYPTION_KEY", key);
  vi.stubEnv("NOTIFICATION_LINE_DESTINATION", destination);
  vi.stubEnv("NOTIFICATION_LINE_ACCESS_TOKEN", "legacy-token");
  vi.stubEnv("NOTIFICATION_LINE_CHANNEL_SECRET", "legacy-secret");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("UNEXPECTED_NETWORK"); }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers();
});

describe("LINE provider settings", () => {
  it("returns only legacy metadata until cutover; webhook fallback does not require the new key", async () => {
    expect(await get(owner)).toEqual({
      source: "ENVIRONMENT", revision: 0, destination, accessTokenConfigured: true, channelSecretConfigured: true,
      updatedAt: null, webhookUrl: "https://fitness.example/api/line/webhook", outboundEnabled: false,
    });
    vi.stubEnv("PROVIDER_CONFIG_ENCRYPTION_KEY", "");
    expect(await resolve()).toEqual({ channelSecret: "legacy-secret", destination });
    vi.stubEnv("NOTIFICATION_LINE_DESTINATION", "");
    expect(await resolve()).toEqual({ channelSecret: "legacy-secret" });
    vi.stubEnv("PROVIDER_CONFIG_ENCRYPTION_KEY", key);
    vi.stubEnv("NOTIFICATION_LINE_ACCESS_TOKEN", ""); vi.stubEnv("NOTIFICATION_LINE_CHANNEL_SECRET", "");
    expect(await get(owner)).toMatchObject({ source: "NONE", destination: null, accessTokenConfigured: false, channelSecretConfigured: false });
    expect(await resolve()).toBeNull();
  });

  it.each(["MANAGER", "COUNTER", "TRAINER"] as const)("rejects %s before provider data access", async role => {
    const actor = { ...owner, role };
    await expect(get(actor)).rejects.toMatchObject({ status: 403 });
    await expect(update(actor, first)).rejects.toMatchObject({ status: 403 });
    expect(mocks.select).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    { revision: 0, accessToken: "new", channelSecret: "new" }, { revision: 0, destination, accessToken: "new" },
    { revision: 0, destination, clearChannelSecret: true }, { ...first, clearAccessToken: true },
    { ...first, clearChannelSecret: true }, { ...first, accessToken: "" }, { ...first, channelSecret: " " },
    { ...first, channelSecret: "ab\u007fcd" }, { ...first, accessToken: " x" }, { ...first, channelSecret: "a".repeat(4097) },
    { ...first, accessToken: "\ud800" },
    { ...first, destination: other + "\n" }, { ...first, revision: -1 }, { ...first, revision: 0.5 },
    { ...first, extra: "private" }, { ...first, clearAccessToken: "true" },
  ])("rejects incomplete/invalid input %# without creating a row", async input => {
    await expect(update(owner, input)).rejects.toMatchObject({ status: 400 });
    expect(state.providers).toEqual([]);
  });

  it("encrypts replacements, preserves omitted fields and clears authoritatively without network or secret audits", async () => {
    const created = await update(owner, first);
    expect(created).toEqual({ source: "DATABASE", revision: 1, destination, accessTokenConfigured: true, channelSecretConfigured: true,
      updatedAt: now.toISOString(), webhookUrl: "https://fitness.example/api/line/webhook", outboundEnabled: false });
    const row = state.providers[0];
    expect(decryptProviderCredential(String(row.accessTokenEncrypted), "accessToken", key)).toBe("new-token");
    expect(JSON.stringify(row)).not.toMatch(/new-token|new-secret|legacy-/);
    expect(await resolve()).toEqual({ channelSecret: "new-secret", destination });
    const oldToken = row.accessTokenEncrypted;
    expect(await update(owner, { revision: 1, channelSecret: "rotated" })).toMatchObject({ revision: 2 });
    expect(state.providers[0].accessTokenEncrypted).toBe(oldToken);
    expect(await resolve()).toEqual({ channelSecret: "rotated", destination });
    const cleared = await update(owner, { revision: 2, clearAccessToken: true, clearChannelSecret: true });
    expect(cleared).toMatchObject({ source: "DATABASE", revision: 3, destination, accessTokenConfigured: false, channelSecretConfigured: false });
    expect(await get(owner)).toEqual(cleared); expect(await resolve()).toBeNull();
    expect(state.providers[0]).toMatchObject({ channelSecretEncrypted: null, accessTokenEncrypted: null, updatedByStaffId: 2 });
    expect(state.audits.map(row => row.metadata)).toEqual([1, 2, 3].map(revision => ({ source: "LINE", status: "UPDATED", revision })));
    expect(JSON.stringify(state.audits)).not.toContain(destination);
  });

  it("never replaces a winner with stale input and rolls back an audit failure", async () => {
    const outcomes = await Promise.allSettled([update(owner, first), update(owner, { ...first, accessToken: "loser" })]);
    expect(outcomes.map(result => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(outcomes[1]).toMatchObject({ reason: { status: 409 } });
    const saved = structuredClone(state.providers);
    state.beforeUpdate = async () => { state.providers[0].revision = 8; };
    await expect(update(owner, { revision: 1, clearAccessToken: true })).rejects.toMatchObject({ status: 409 });
    expect(state.providers).toEqual(saved);
    state.beforeUpdate = undefined; state.failAudit = true;
    await expect(update(owner, { revision: 1, clearChannelSecret: true })).rejects.toMatchObject({ status: 503 });
    expect(state.providers).toEqual(saved);
    expect(state.audits.filter(a => a.result === "SUCCESS")).toHaveLength(1);
  });

  it.each(["linked", "active", "queued", "processing", "failed", "skipped"])("blocks a destination switch with %s data, but allows same-bot cutover/rotation", async kind => {
    if (kind === "linked") state.links = [{ memberId: 7, lineUserId: other }];
    else if (kind === "active") state.links = [{ memberId: 7, lineUserId: null, challengeHash: "abc", challengeExpiresAt: new Date(+now + 1000) }];
    else state.rows = [queuedNotification({ status: kind.toUpperCase() })];
    await expect(update(owner, { ...first, destination: other })).rejects.toMatchObject({ status: 409 });
    vi.stubEnv("NOTIFICATION_LINE_DESTINATION", "");
    await expect(update(owner, first)).rejects.toMatchObject({ status: 409 });
    vi.stubEnv("NOTIFICATION_LINE_DESTINATION", destination);
    await update(owner, first);
    await expect(update(owner, { revision: 1, destination: other })).rejects.toMatchObject({ status: 409 });
    expect(await update(owner, { revision: 1, accessToken: "rotated" })).toMatchObject({ revision: 2 });
  });

  it("cleans only expired unlinked challenges transactionally; SENT or another channel do not block", async () => {
    state.links = [{ memberId: 7, lineUserId: null, challengeHash: "expired", challengeExpiresAt: now }];
    state.rows = [queuedNotification({ status: "SENT" }), queuedNotification({ channel: "EMAIL" })];
    state.failAudit = true;
    await expect(update(owner, { ...first, destination: other })).rejects.toMatchObject({ status: 503 });
    expect(state.links).toHaveLength(1); expect(state.providers).toHaveLength(0);
    state.failAudit = false;
    expect(await update(owner, { ...first, destination: other })).toMatchObject({ destination: other });
    expect(state.links).toHaveLength(0);
    expect(mocks.transaction.mock.lastCall?.[1]).toMatchObject({ isolationLevel: "repeatable read" });
  });

  it.each(["missing-key", "wrong-key", "tampered-token", "tampered-secret", "field-swap", "invalid-destination"])("fails closed on %s even for full replacement without partial writes", async fault => {
    await update(owner, first);
    const row = state.providers[0];
    if (fault === "missing-key") vi.stubEnv("PROVIDER_CONFIG_ENCRYPTION_KEY", "");
    if (fault === "wrong-key") vi.stubEnv("PROVIDER_CONFIG_ENCRYPTION_KEY", Buffer.alloc(32, 9).toString("base64"));
    if (fault === "tampered-token") row.accessTokenEncrypted = "PRIVATE_CIPHERTEXT";
    if (fault === "tampered-secret") row.channelSecretEncrypted = "PRIVATE_CIPHERTEXT";
    if (fault === "field-swap") row.accessTokenEncrypted = row.channelSecretEncrypted;
    if (fault === "invalid-destination") row.destination = "";
    const saved = structuredClone(row);
    const failedGet = get(owner);
    await expect(failedGet).rejects.toMatchObject({ status: 503, message: "การตั้งค่า LINE ยังไม่พร้อมใช้งาน" });
    await expect(failedGet).rejects.not.toHaveProperty("cause");
    await expect(update(owner, { ...first, revision: 1 })).rejects.toMatchObject({ status: 503 });
    expect(await resolve()).toBeNull(); expect(state.providers[0]).toEqual(saved);
  });

  it("requires a valid key even when clearing both fields on first cutover or updating an all-clear row", async () => {
    const clear = { revision: 0, destination, clearAccessToken: true, clearChannelSecret: true };
    vi.stubEnv("PROVIDER_CONFIG_ENCRYPTION_KEY", "");
    await expect(update(owner, clear)).rejects.toMatchObject({ status: 503 });
    vi.stubEnv("PROVIDER_CONFIG_ENCRYPTION_KEY", key); await update(owner, clear);
    vi.stubEnv("PROVIDER_CONFIG_ENCRYPTION_KEY", "");
    await expect(get(owner)).rejects.toMatchObject({ status: 503 });
    await expect(update(owner, { ...clear, revision: 1 })).rejects.toMatchObject({ status: 503 });
  });
  it("does not fall back when the provider table cannot be read", async () => {
    state.beforeRead = () => { throw new Error("PRIVATE_DB"); };
    expect(await resolve()).toBeNull();
    await expect(get(owner)).rejects.toMatchObject({ status: 503 });
  });
});
