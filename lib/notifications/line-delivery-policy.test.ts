import { beforeEach, describe, expect, it, vi } from "vitest";
import { memberLineLinks, members, notifications } from "@/db/schema";
import type { DbTransaction } from "@/lib/audit-service";
import { notificationTestDb, queuedNotification } from "./notification-test-db";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/db", () => ({ db: mocks }));
import { cancelUnsentLineNotifications, claimLineNotification } from "./line-delivery-policy";

let fixture: ReturnType<typeof notificationTestDb>;
beforeEach(() => { fixture = notificationTestDb(); mocks.transaction.mockImplementation(fixture.db.transaction); fixture.state.rows = [queuedNotification()]; });
const claim = (enabled = true) => claimLineNotification(1, 7, 10, enabled);
const cancel = (scope: "ALL" | "INACTIVITY" = "ALL") => fixture.db.transaction(async tx => {
  const executor = tx as DbTransaction;
  await executor.select().from(members).where(undefined).for("update");
  await executor.select().from(memberLineLinks).where(undefined).for("update");
  return cancelUnsentLineNotifications(executor, 7, scope, "LINE_UNLINKED");
});

describe("LINE delivery policy", () => {
  it.each([
    ["INACTIVITY", true, true, true], ["INACTIVITY", true, false, false],
    ["INACTIVITY", false, true, false], ["EXPIRY_REMINDER", true, false, true],
    ["EXPIRY_REMINDER", false, true, false], ["SCAN_WARNING", true, true, false],
  ])("requires the current consent matrix for %s/service=%s/marketing=%s", async (type, service, marketing, allowed) => {
    fixture.state.rows[0].type = type;
    fixture.state.events[0].action = service ? "GRANTED" : "WITHDRAWN";
    fixture.state.events[1].action = marketing ? "GRANTED" : "WITHDRAWN";
    const result = await claim();
    expect(result?.status).toBe(allowed ? "PROCESSING" : "SKIPPED");
    expect(fixture.state.rows[0]).toMatchObject(allowed ? { attemptCount: 1 } : { recipient: null, failureKind: "PERMANENT", sentAt: null });
  });

  it.each(["missing", "pending", "malformed", "replaced", "mismatch", "branch", "cancelled"])("terminally cancels %s link/member policy without retargeting", async kind => {
    if (kind === "missing") fixture.state.links = [];
    if (kind === "pending") Object.assign(fixture.state.links[0], { lineUserId: null, linkedAt: null, challengeHash: "hash", challengeExpiresAt: new Date(Date.now() + 10000) });
    if (kind === "malformed") fixture.state.links[0].lineUserId = "not-a-line-user";
    if (kind === "replaced") fixture.state.links[0].lineUserId = `U${"b".repeat(32)}`;
    if (kind === "mismatch") fixture.state.rows[0].recipient = null;
    if (kind === "branch") fixture.state.links[0].branchId = 11;
    if (kind === "cancelled") fixture.state.member.status = "CANCELLED";
    expect(await claim()).toMatchObject({ status: "SKIPPED", failureKind: "PERMANENT" });
    expect(fixture.state.rows[0]).toMatchObject({ status: "SKIPPED", recipient: null, attemptCount: 0 });
  });

  it.each(["FROZEN", "EXPIRED"])("allows operational expiry for %s members", async status => {
    fixture.state.member.status = status; fixture.state.rows[0].type = "EXPIRY_REMINDER";
    expect(await claim()).toMatchObject({ status: "PROCESSING", attemptCount: 1 });
  });

  it("uses locking current consent reads with timestamp/id precedence and denies missing consent", async () => {
    fixture.state.events.push({ ...fixture.state.events[0], id: 3, action: "WITHDRAWN" });
    expect(await claim()).toMatchObject({ status: "SKIPPED" });
    fixture.state.rows = [queuedNotification()]; fixture.state.events = [];
    expect(await claim()).toMatchObject({ status: "SKIPPED" });
  });

  it("locks member then link then notification and creates the lease after waiting for locks", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-09T00:00:00Z"));
    try {
      fixture.state.beforeLock = table => { if (table === notifications) vi.setSystemTime(new Date("2026-11-09T00:01:00Z")); };
      expect(await claim()).toMatchObject({ claimedAt: new Date("2026-11-09T00:01:00Z"), attemptCount: 1 });
      expect(fixture.state.locks.slice(0, 3)).toEqual(["members", "member_line_links", "notifications"]);
      expect(fixture.state.locks.filter(name => name === "consent_events")).toHaveLength(2);
    } finally { vi.useRealTimers(); }
  });

  it("denies changed branch ownership without mutating another branch's notification", async () => {
    fixture.state.member.homeBranchId = 11;
    expect(await claim()).toBeNull(); expect(fixture.state.rows[0].status).toBe("QUEUED");
  });

  it("lets only one concurrent preflight claim the same queued LINE row", async () => {
    const results = await Promise.all([claim(), claim()]);
    expect(results[0]).toMatchObject({ status: "PROCESSING", attemptCount: 1 });
    expect(results[1]).toBeNull(); expect(fixture.state.rows[0].attemptCount).toBe(1);
  });

  it("rechecks notification ownership/type after locks instead of using candidate metadata", async () => {
    fixture.state.beforeLock = table => { if (table === notifications) fixture.state.rows[0].memberId = 8; };
    expect(await claim()).toBeNull(); expect(fixture.state.rows[0].status).toBe("QUEUED");
    fixture.state.rows[0].memberId = 7;
    fixture.state.beforeLock = table => { if (table === notifications) fixture.state.rows[0].type = "SCAN_WARNING"; };
    expect(await claim()).toMatchObject({ status: "SKIPPED", failureKind: "PERMANENT" });
  });

  it.each([
    ["QUEUED", null, 0, null, true], ["FAILED", "RETRYABLE", 2, null, true],
    ["FAILED", "PERMANENT", 2, null, false], ["SKIPPED", "CONFIG", 0, null, false],
    ["SKIPPED", "PERMANENT", 0, null, false], ["SENT", null, 1, null, false],
    ["PROCESSING", null, 1, new Date(0), true], ["PROCESSING", null, 1, new Date("2099-01-01"), false],
    ["QUEUED", null, 5, null, false],
  ])("enforces LINE claim eligibility %s/%s/%s", async (status, failureKind, attemptCount, lastAttemptAt, allowed) => {
    Object.assign(fixture.state.rows[0], { status, failureKind, attemptCount, lastAttemptAt });
    const result = await claim();
    expect(result?.status === "PROCESSING").toBe(allowed);
    if (!allowed) expect(fixture.state.rows[0].attemptCount).toBe(attemptCount);
  });

  it("terminally policy-skips disabled LINE before claiming", async () => {
    expect(await claim(false)).toMatchObject({ status: "SKIPPED", attemptCount: 0 });
    expect(fixture.state.rows[0]).toMatchObject({ recipient: null, failureKind: "PERMANENT" });
    expect(fixture.state.audits[0].metadata).toEqual({ source: "LINE_DELIVERY", errorCode: "LINE_DISABLED", count: 1 });
  });

  it("cancels all unsent LINE rows, including terminal SKIPPED PII, but not SENT/other channels/members", async () => {
    fixture.state.rows = ["QUEUED", "PROCESSING", "FAILED", "SKIPPED"].map((status, index) => queuedNotification({ id: index + 1, status, sentAt: new Date() }));
    fixture.state.rows.push(queuedNotification({ id: 5, status: "SENT" }), queuedNotification({ id: 6, channel: "SMS" }), queuedNotification({ id: 7, memberId: 8 }), queuedNotification({ id: 8, status: "SKIPPED", recipient: null, failureKind: "CONFIG" }));
    expect(await cancel()).toBe(4);
    for (const row of fixture.state.rows.slice(0, 4)) expect(row).toMatchObject({ status: "SKIPPED", failureKind: "PERMANENT", recipient: null, sentAt: null, errorMessage: "ยกเลิกการแจ้งเตือน LINE ตามนโยบายความเป็นส่วนตัว" });
    expect(fixture.state.rows.slice(4).map(row => row.status)).toEqual(["SENT", "QUEUED", "QUEUED", "SKIPPED"]);
    expect(fixture.state.rows[7].failureKind).toBe("CONFIG");
    expect(await cancel()).toBe(0); expect(fixture.state.audits).toHaveLength(1);
    expect(fixture.state.audits[0]).toMatchObject({ branchId: null, actorStaffId: null, action: "LINE_NOTIFICATIONS_CANCELLED", metadata: { source: "LINE_DELIVERY", errorCode: "LINE_UNLINKED", count: 4 } });
    expect(JSON.stringify(fixture.state.audits)).not.toMatch(/private|Uaaaa|recipient|message/);
  });

  it("marketing scope preserves operational reminders and cancellation never revives on relink/grant", async () => {
    fixture.state.rows.push(queuedNotification({ id: 2, type: "EXPIRY_REMINDER" }));
    expect(await cancel("INACTIVITY")).toBe(1);
    fixture.state.links[0].lineUserId = `U${"b".repeat(32)}`;
    expect(await claim()).toBeNull(); expect(fixture.state.rows[1].status).toBe("QUEUED");
  });

  it("rolls cancellation and PII scrub back if audit fails", async () => {
    fixture.state.failAudit = true;
    await expect(cancel()).rejects.toThrow("AUDIT_FAILED");
    expect(fixture.state.rows[0]).toMatchObject({ status: "QUEUED", recipient: `U${"a".repeat(32)}` });
  });
});
