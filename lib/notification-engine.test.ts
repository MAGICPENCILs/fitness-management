import { beforeEach, describe, expect, it, vi } from "vitest";
import { notificationTestDb, queuedNotification } from "@/lib/notifications/notification-test-db";

const mocks = vi.hoisted(() => ({ select: vi.fn(), update: vi.fn(), transaction: vi.fn(), deliver: vi.fn(), claim: vi.fn() }));
vi.mock("@/db", () => ({ db: mocks }));
vi.mock("@/lib/notifications/providers/delivery", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/notifications/providers/delivery")>(), deliverNotification: mocks.deliver }));
vi.mock("@/lib/notifications/line-delivery-policy", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/notifications/line-delivery-policy")>(), claimLineNotification: mocks.claim }));
import { deliverQueuedNotifications, processNotificationDelivery } from "./notification-engine";
import { removeLineLink } from "./line-link-service";

let fixture: ReturnType<typeof notificationTestDb>;
let realClaim: typeof import("@/lib/notifications/line-delivery-policy").claimLineNotification;
beforeEach(async () => {
  vi.resetAllMocks(); fixture = notificationTestDb(); fixture.state.rows = [queuedNotification()];
  mocks.select.mockImplementation(fixture.db.select); mocks.update.mockImplementation(fixture.db.update); mocks.transaction.mockImplementation(fixture.db.transaction);
  mocks.deliver.mockResolvedValue({ outcome: "sent" });
  realClaim = (await vi.importActual<typeof import("@/lib/notifications/line-delivery-policy")>("@/lib/notifications/line-delivery-policy")).claimLineNotification;
  mocks.claim.mockImplementation(realClaim);
});

/** ทดสอบ path หลัง preflight ที่อนุญาตโดย mock เฉพาะ gate input; adapter ยังเป็น fake เสมอและไม่เปิด outbound จริง */
function allowSyntheticPreflight() {
  mocks.claim.mockImplementation((id: number, memberId: number, branchId: number, enabled: boolean) => {
    expect(enabled).toBe(false);
    return realClaim(id, memberId, branchId, true);
  });
}

describe("notification dispatch fences", () => {
  it("terminal LINE config skips cannot fill a batch and starve ordinary queued delivery", async () => {
    fixture.state.rows = [queuedNotification({ status: "SKIPPED", failureKind: "CONFIG", recipient: null }), queuedNotification({ id: 2, channel: "SMS" })];
    expect(await deliverQueuedNotifications(10, 1)).toEqual({ processed: 1, sent: 1, failed: 0, skipped: 0 });
    expect(fixture.state.rows[1].status).toBe("SENT");
  });

  it("never calls the adapter for LINE even if persisted settings say enabled", async () => {
    expect(await processNotificationDelivery(1, 10)).toMatchObject({ status: "SKIPPED", failureKind: "PERMANENT", attemptCount: 0 });
    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(fixture.state.rows[0]).toMatchObject({ recipient: null, status: "SKIPPED" });
  });

  it("unlink-first permanently cancels LINE before preflight with zero provider calls", async () => {
    await removeLineLink({ staffId: 3, role: "OWNER", homeBranchId: 10 }, 7);
    await expect(processNotificationDelivery(1, 10)).rejects.toMatchObject({ status: 409 });
    expect(mocks.deliver).not.toHaveBeenCalled(); expect(fixture.state.rows[0].recipient).toBeNull();
  });

  it("unlink after preflight but before the final read blocks the LINE provider", async () => {
    allowSyntheticPreflight();
    fixture.state.afterCommit = () => removeLineLink({ staffId: 3, role: "OWNER", homeBranchId: 10 }, 7).then(() => undefined);
    await expect(processNotificationDelivery(1, 10)).rejects.toMatchObject({ status: 409 });
    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(fixture.state.rows[0]).toMatchObject({ status: "SKIPPED", failureKind: "PERMANENT", recipient: null, attemptCount: 1 });
  });

  it("late LINE acknowledgement cannot revive an unlink cancellation", async () => {
    allowSyntheticPreflight();
    mocks.deliver.mockImplementation(async () => {
      expect(fixture.state.active).toBe(false);
      await removeLineLink({ staffId: 3, role: "OWNER", homeBranchId: 10 }, 7);
      return { outcome: "sent" };
    });
    await expect(processNotificationDelivery(1, 10)).rejects.toMatchObject({ status: 409 });
    expect(fixture.state.rows[0]).toMatchObject({ status: "SKIPPED", recipient: null, sentAt: null });
  });

  it.each(["SMS", "EMAIL"])("preserves ordinary %s delivery outside transactions", async channel => {
    fixture.state.rows[0].channel = channel;
    mocks.deliver.mockImplementation(async () => { expect(fixture.state.active).toBe(false); return { outcome: "sent" }; });
    expect(await processNotificationDelivery(1, 10)).toMatchObject({ status: "SENT", attemptCount: 1 });
    expect(mocks.deliver).toHaveBeenCalledOnce();
  });

  it.each(["SMS", "EMAIL"])("rejects a stale %s candidate after another worker completes retryably without consuming an attempt", async channel => {
    fixture.state.rows[0].channel = channel;
    mocks.deliver.mockResolvedValueOnce({ outcome: "retryable_failure", errorCode: "PROVIDER_TEMPORARY_FAILURE" }).mockResolvedValueOnce({ outcome: "sent" });
    // worker B อ่าน QUEUED แล้วพักก่อน UPDATE ให้ worker A claim และจบแบบ retryable ก่อน
    fixture.state.beforeUpdate = async () => {
      fixture.state.beforeUpdate = undefined;
      expect(await processNotificationDelivery(1, 10)).toMatchObject({ status: "FAILED", failureKind: "RETRYABLE", attemptCount: 1 });
    };
    await expect(processNotificationDelivery(1, 10)).rejects.toMatchObject({ status: 409 });
    expect(fixture.state.rows[0]).toMatchObject({ status: "FAILED", failureKind: "RETRYABLE", attemptCount: 1 });
    expect(mocks.deliver).toHaveBeenCalledOnce();
    expect(await processNotificationDelivery(1, 10)).toMatchObject({ status: "SENT", attemptCount: 2 });
  });

  it("does not dispatch a snapshot cancelled after claim and before the final state read", async () => {
    fixture.state.rows[0].channel = "SMS";
    let reads = 0;
    fixture.state.beforeRead = () => { if (++reads === 2) Object.assign(fixture.state.rows[0], { status: "SKIPPED", failureKind: "PERMANENT", recipient: null }); };
    await expect(processNotificationDelivery(1, 10)).rejects.toMatchObject({ status: 409 });
    expect(mocks.deliver).not.toHaveBeenCalled(); expect(fixture.state.rows[0].status).toBe("SKIPPED");
  });

  it.each(["cancelled", "reclaimed-same-second"])("late provider completion cannot overwrite a %s claim", async kind => {
    fixture.state.rows[0].channel = "SMS";
    mocks.deliver.mockImplementation(async () => {
      if (kind === "cancelled") Object.assign(fixture.state.rows[0], { status: "SKIPPED", failureKind: "PERMANENT", recipient: null });
      else fixture.state.rows[0].attemptCount = 2;
      return { outcome: "sent" };
    });
    await expect(processNotificationDelivery(1, 10)).rejects.toMatchObject({ status: 409 });
    expect(fixture.state.rows[0].status).toBe(kind === "cancelled" ? "SKIPPED" : "PROCESSING");
  });
});
