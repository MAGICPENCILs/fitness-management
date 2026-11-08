import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createLineLinkChallenge, hashLineLinkToken, lineLinkStatus, parseLineLinkEvent, readLineWebhookBody, verifyLineSignature } from "@/lib/line-link-policy";

const now = new Date("2026-11-08T00:00:00Z");
const userId = `U${"a".repeat(32)}`;
const token = "a".repeat(43);

describe("LINE linking policy", () => {
  it("issues a 256-bit once-only token and stores only its SHA-256 hash for 15 minutes", () => {
    const challenge = createLineLinkChallenge(now);
    expect(challenge.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge.challengeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(challenge.challengeHash).toBe(hashLineLinkToken(challenge.token));
    expect(challenge.challengeExpiresAt.toISOString()).toBe("2026-11-08T00:15:00.000Z");
    expect(createLineLinkChallenge(now).token).not.toBe(challenge.token);
  });

  it("projects absent and expired rows as UNLINKED and never exposes identifiers or hashes", () => {
    expect(lineLinkStatus(undefined, now)).toEqual({ status: "UNLINKED", challengeExpiresAt: null, linkedAt: null });
    expect(lineLinkStatus({ lineUserId: null, challengeHash: "secret", challengeExpiresAt: now, linkedAt: null }, now)).toEqual({ status: "UNLINKED", challengeExpiresAt: null, linkedAt: null });
    expect(lineLinkStatus({ lineUserId: null, challengeHash: "secret", challengeExpiresAt: new Date("2026-11-08T00:15:00Z"), linkedAt: null }, now)).toEqual({ status: "PENDING", challengeExpiresAt: "2026-11-08T00:15:00.000Z", linkedAt: null });
    expect(lineLinkStatus({ lineUserId: userId, challengeHash: null, challengeExpiresAt: null, linkedAt: now }, now)).toEqual({ status: "LINKED", challengeExpiresAt: null, linkedAt: "2026-11-08T00:00:00.000Z" });
  });

  it("accepts only exact LINK commands from a direct user with a lowercase LINE identifier", () => {
    const event = { type: "message", source: { type: "user", userId }, message: { type: "text", text: `LINK ${token}` } };
    expect(parseLineLinkEvent(event)).toEqual({ token, lineUserId: userId });
    for (const invalid of [null, {}, { ...event, source: { type: "group", userId } }, { ...event, source: { type: "user", userId: userId.toUpperCase() } }, ...[`${event.message.text}\n`, `link ${token}`, `LINK ${token}=`, `LINK ${"a".repeat(42)}`].map(text => ({ ...event, message: { type: "text", text } }))]) expect(parseLineLinkEvent(invalid)).toBeNull();
  });

  it("authenticates exact bytes and rejects absent, malformed and tampered signatures", () => {
    const body = Buffer.from('{"events":[]}');
    const signature = createHmac("sha256", "test-secret").update(body).digest("base64");
    expect(verifyLineSignature(body, signature, "test-secret")).toBe(true);
    expect(verifyLineSignature(Buffer.concat([body, Buffer.from(" ")]), signature, "test-secret")).toBe(false);
    for (const invalid of [null, "", signature.slice(1), "!".repeat(44)]) expect(verifyLineSignature(body, invalid, "test-secret")).toBe(false);
  });

  it.each([undefined, "1"])("bounds streamed bytes even with length %s and stops before reading the rest", async (length) => {
    let reads = 0; let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ pull(controller) { reads++; controller.enqueue(new Uint8Array(131073)); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
    const request = { headers: new Headers(length ? { "content-length": length } : {}), body } as Request;
    await expect(readLineWebhookBody(request)).rejects.toMatchObject({ status: 413 });
    expect(reads).toBe(2); expect(cancelled).toBe(true);
  });

  it("allows exactly 256 KiB but rejects declared oversized bodies before reading", async () => {
    const accepted = new Request("https://example.test", { method: "POST", body: new Uint8Array(262144) });
    expect((await readLineWebhookBody(accepted)).length).toBe(262144);
    await expect(readLineWebhookBody({ headers: new Headers({ "content-length": "262145" }), body: null } as Request)).rejects.toMatchObject({ status: 413 });
  });
});
