import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { consentEvents, memberLineLinks, members, notifications, type Notification } from "@/db/schema";
import { writeAudit, type DbTransaction } from "@/lib/audit-service";
import { isLineUserId, lineLinkStatus } from "@/lib/line-link-policy";
import { canClaimDelivery } from "./providers/delivery";

type CancellationReason = "LINE_UNLINKED" | "SERVICE_PRIVACY_WITHDRAWN" | "MARKETING_WITHDRAWN" | "LINE_POLICY_REJECTED" | "LINE_DISABLED";
const cancellation = {
  status: "SKIPPED" as const,
  failureKind: "PERMANENT" as const,
  recipient: null,
  sentAt: null,
  errorMessage: "ยกเลิกการแจ้งเตือน LINE ตามนโยบายความเป็นส่วนตัว",
};

/** ล้างผู้รับและปิดรายการถาวรพร้อม audit ใน transaction เดียว; การเชื่อมใหม่ไม่คืนคิวเก่า */
async function cancelRows(tx: DbTransaction, memberId: number, ids: number[], reasonCode: CancellationReason) {
  if (!ids.length) return 0;
  const [result] = await tx.update(notifications).set(cancellation).where(and(
    eq(notifications.memberId, memberId), eq(notifications.channel, "LINE"), inArray(notifications.id, ids),
  ));
  const count = result.affectedRows;
  if (count) await writeAudit(tx, {
    actorStaffId: null, branchId: null, action: "LINE_NOTIFICATIONS_CANCELLED", entityType: "MEMBER", entityId: memberId, result: "SUCCESS",
    metadata: { source: "LINE_DELIVERY", errorCode: reasonCode, count },
  });
  return count;
}

/** caller ต้อง lock member→link ก่อน; SKIPPED เป็น terminal อยู่แล้วจึงแตะซ้ำเฉพาะแถวที่ยังมีผู้รับ */
export async function cancelUnsentLineNotifications(tx: DbTransaction, memberId: number, scope: "ALL" | "INACTIVITY", reasonCode: CancellationReason): Promise<number> {
  const rows = await tx.select({ id: notifications.id, status: notifications.status, recipient: notifications.recipient })
    .from(notifications).where(and(eq(notifications.memberId, memberId), eq(notifications.channel, "LINE"), scope === "INACTIVITY" ? eq(notifications.type, "INACTIVITY") : undefined)).for("update");
  return cancelRows(tx, memberId, rows.filter(row => row.status !== "SENT" && (row.status !== "SKIPPED" || row.recipient !== null)).map(row => row.id), reasonCode);
}

export type LineDeliveryClaim =
  | (Notification & { status: "PROCESSING"; claimedAt: Date })
  | { id: number; status: "SKIPPED"; failureKind: "PERMANENT"; attemptCount: number };

/** revalidate ด้วย current locking read ตาม member→link→notification และปล่อย lock ก่อนเรียก provider เสมอ */
export async function claimLineNotification(notificationId: number, memberId: number, branchId: number, enabled: boolean): Promise<LineDeliveryClaim | null> {
  return db.transaction(async tx => {
    const [member] = await tx.select({ homeBranchId: members.homeBranchId, status: members.status }).from(members).where(eq(members.id, memberId)).limit(1).for("update");
    if (!member || member.homeBranchId !== branchId) return null;
    const [link] = await tx.select().from(memberLineLinks).where(eq(memberLineLinks.memberId, memberId)).limit(1).for("update");
    const [record] = await tx.select().from(notifications).where(and(eq(notifications.id, notificationId), eq(notifications.memberId, memberId), eq(notifications.channel, "LINE"))).limit(1).for("update");
    if (!record) return null;
    if (record.status === "SKIPPED") {
      if (record.recipient !== null) await cancelRows(tx, memberId, [record.id], "LINE_POLICY_REJECTED");
      return null;
    }
    if (!canClaimDelivery(record.status, record.failureKind, record.attemptCount, record.lastAttemptAt)) return null;
    let allowed = enabled && member.status !== "CANCELLED" && link?.branchId === member.homeBranchId
      && isLineUserId(link?.lineUserId) && lineLinkStatus(link).status === "LINKED" && record.recipient === link.lineUserId
      && (record.type === "INACTIVITY" || record.type === "EXPIRY_REMINDER");
    if (allowed) {
      const required = record.type === "INACTIVITY" ? ["SERVICE_PRIVACY", "MARKETING"] as const : ["SERVICE_PRIVACY"] as const;
      for (const consentType of required) {
        const [latest] = await tx.select({ action: consentEvents.action }).from(consentEvents)
          .where(and(eq(consentEvents.memberId, memberId), eq(consentEvents.consentType, consentType)))
          .orderBy(desc(consentEvents.createdAt), desc(consentEvents.id)).limit(1).for("update");
        if (latest?.action !== "GRANTED") allowed = false;
      }
    }
    if (!allowed) {
      await cancelRows(tx, memberId, [record.id], enabled ? "LINE_POLICY_REJECTED" : "LINE_DISABLED");
      return { id: record.id, status: "SKIPPED", failureKind: "PERMANENT", attemptCount: record.attemptCount };
    }
    // สร้าง token หลัง await/lock สุดท้าย และตัด ms ให้ตรง MySQL timestamp ระดับวินาที
    const claimedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    const attemptCount = record.attemptCount + 1;
    await tx.update(notifications).set({ status: "PROCESSING", attemptCount, lastAttemptAt: claimedAt }).where(eq(notifications.id, record.id));
    return { ...record, status: "PROCESSING", attemptCount, lastAttemptAt: claimedAt, claimedAt };
  });
}
