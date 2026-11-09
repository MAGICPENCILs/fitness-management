import "server-only";

import { and, desc, eq, inArray, isNotNull, isNull, lt, lte, max, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accessLogs,
  consentEvents,
  memberPackages,
  members,
  NewNotification,
  notifications,
  notificationSettings,
} from "@/db/schema";
import type { DbTransaction } from "@/lib/audit-service";
import { getLatestConsent } from "@/lib/consent-policy";
import {
  canClaimDelivery,
  deliverNotification,
  NOTIFICATION_CLAIM_LEASE_MS,
  type DeliveryResult,
} from "@/lib/notifications/providers/delivery";
import {
  getProviderHealth,
  loadDeliveryEnvironment,
} from "@/lib/notifications/providers/config";
import { sendSmtpNotification } from "@/lib/notifications/providers/smtp";
import { claimLineNotification, type LineDeliveryClaim } from "@/lib/notifications/line-delivery-policy";

export const defaultNotificationSettings = {
  id: 1,
  reminderDays: "7,3,1",
  inactivityDays: 30,
  enableInApp: true,
  enableSms: false,
  enableLine: false,
  enableEmail: false,
  isActive: true,
} as const;

type NotificationChannel = NewNotification["channel"];

type NotificationMember = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
};

/** แปลงวันที่เป็นจุดเริ่มต้นของวันท้องถิ่น เพื่อคำนวณจำนวนวันโดยไม่คลาดเคลื่อนจากเวลา */
function startOfLocalDay(value: string | Date) {
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T00:00:00`);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** สร้างรหัสวันที่แบบคงที่สำหรับใช้ป้องกันการแจ้งเตือนซ้ำ */
function toDateKey(value: string | Date) {
  const date = startOfLocalDay(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** คำนวณผลต่างเป็นจำนวนวันปฏิทินในเขตเวลาท้องถิ่น */
function differenceInDays(later: string | Date, earlier: string | Date) {
  return Math.round(
    (startOfLocalDay(later).getTime() - startOfLocalDay(earlier).getTime()) / 86_400_000,
  );
}

/** แปลงค่าจำนวนวันเตือนเป็นรายการเลขจำนวนเต็มบวกที่ไม่ซ้ำและเรียงจากมากไปน้อย */
export function parseReminderDays(value: string) {
  return [...new Set(value.split(",").map(Number).filter((day) => Number.isInteger(day) && day > 0))]
    .sort((a, b) => b - a);
}

/** โหลดค่าตั้งต้นการแจ้งเตือน โดยคืนค่าเริ่มต้นหากยังไม่เคยบันทึกลงฐานข้อมูล */
export async function getNotificationSettings(executor?: DbTransaction) {
  const [settings] = await (executor ?? db).select().from(notificationSettings).where(eq(notificationSettings.id, 1)).limit(1);
  return settings ? { ...settings, enableLine: false } : defaultNotificationSettings;
}

/** โหลดประวัติการแจ้งเตือนล่าสุดพร้อมชื่อสมาชิกสำหรับหน้า Admin */
export async function getNotificationHistory(branchId: number, limit = 50) {
  return db
    .select({
      id: notifications.id,
      memberId: notifications.memberId,
      memberCode: members.memberCode,
      memberName: members.firstName,
      memberLastName: members.lastName,
      type: notifications.type,
      channel: notifications.channel,
      status: notifications.status,
      title: notifications.title,
      message: notifications.message,
      scheduledFor: notifications.scheduledFor,
      errorMessage: notifications.errorMessage,
      failureKind: notifications.failureKind,
      attemptCount: notifications.attemptCount,
      lastAttemptAt: notifications.lastAttemptAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .innerJoin(members, eq(notifications.memberId, members.id))
    .where(eq(members.homeBranchId, branchId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

/** เลือกผู้รับและสถานะเริ่มต้นตามช่องทาง โดยไม่อ้างว่าส่งสำเร็จหากยังไม่มี provider */
function getDeliveryState(channel: NotificationChannel, member: NotificationMember) {
  if (channel === "IN_APP") {
    return { recipient: null, status: "SENT" as const, errorMessage: null, sentAt: new Date() };
  }
  if (channel === "SMS" && !member.phone) {
    return { recipient: null, status: "SKIPPED" as const, errorMessage: "สมาชิกไม่มีเบอร์โทรศัพท์", sentAt: null };
  }
  if (channel === "EMAIL" && !member.email) {
    return { recipient: null, status: "SKIPPED" as const, errorMessage: "สมาชิกไม่มีอีเมล", sentAt: null };
  }
  if (channel === "LINE") {
    return { recipient: null, status: "SKIPPED" as const, errorMessage: "ยังไม่ได้เชื่อมต่อ LINE OA", sentAt: null };
  }
  return {
    recipient: channel === "SMS" ? member.phone : member.email,
    status: "QUEUED" as const,
    errorMessage: null,
    sentAt: null,
  };
}

/** คืนรายการช่องทางที่เปิดใช้งานจากค่าตั้งระบบ */
function getEnabledChannels(settings: Awaited<ReturnType<typeof getNotificationSettings>>) {
  const channels: NotificationChannel[] = [];
  if (settings.enableInApp) channels.push("IN_APP");
  if (settings.enableSms) channels.push("SMS");
  if (settings.enableEmail) channels.push("EMAIL");
  return channels;
}

/** บันทึกรายการใหม่เท่านั้น โดยใช้ dedupe key ป้องกันสมาชิกได้รับข้อความเดิมซ้ำ */
async function insertNewNotifications(entries: NewNotification[], executor?: DbTransaction) {
  if (!entries.length) return 0;
  const database = executor ?? db;
  const existing = await database
    .select({ dedupeKey: notifications.dedupeKey })
    .from(notifications)
    .where(inArray(notifications.dedupeKey, entries.map((entry) => entry.dedupeKey)));
  const existingKeys = new Set(existing.map((entry) => entry.dedupeKey));
  const newEntries = entries.filter((entry) => !existingKeys.has(entry.dedupeKey));
  if (!newEntries.length) return 0;

  // INSERT IGNORE ปิดช่องว่างของ race condition หากมีตัวประมวลผลสองรอบเริ่มพร้อมกัน
  const result = await database.insert(notifications).ignore().values(newEntries);
  return result[0].affectedRows;
}

/** สร้างแจ้งเตือนวันหมดอายุและสมาชิกขาดการใช้งานตามค่าตั้งระบบ */
export async function generateNotifications(
  branchId: number,
  now = new Date(),
  executor?: DbTransaction,
) {
  const database = executor ?? db;
  const settings = await getNotificationSettings(executor);
  if (!settings.isActive) return { created: 0, candidates: 0, message: "ระบบแจ้งเตือนถูกปิดใช้งาน" };

  const channels = getEnabledChannels(settings);
  if (!channels.length) return { created: 0, candidates: 0, message: "ยังไม่ได้เปิดช่องทางแจ้งเตือน" };

  const [packages, activeMembers, lastVisits, consentRows] = await Promise.all([
    database
      .select({
        id: memberPackages.id,
        memberId: members.id,
        firstName: members.firstName,
        lastName: members.lastName,
        phone: members.phone,
        email: members.email,
        expireDate: memberPackages.expireDate,
      })
      .from(memberPackages)
      .innerJoin(members, eq(memberPackages.memberId, members.id))
      .where(
        and(
          eq(memberPackages.status, "ACTIVE"),
          eq(members.status, "ACTIVE"),
          eq(members.homeBranchId, branchId),
        ),
      ),
    database
      .select({
        id: members.id,
        firstName: members.firstName,
        lastName: members.lastName,
        phone: members.phone,
        email: members.email,
        createdAt: members.createdAt,
      })
      .from(members)
      .where(
        and(eq(members.status, "ACTIVE"), eq(members.homeBranchId, branchId)),
      ),
    database
      .select({ memberId: accessLogs.memberId, lastVisit: max(accessLogs.scannedAt) })
      .from(accessLogs)
      .where(
        and(
          eq(accessLogs.result, "APPROVED"),
          eq(accessLogs.branchId, branchId),
          isNotNull(accessLogs.memberId),
        ),
      )
      .groupBy(accessLogs.memberId),
    database
      .select({
        id: consentEvents.id,
        memberId: consentEvents.memberId,
        consentType: consentEvents.consentType,
        action: consentEvents.action,
        createdAt: consentEvents.createdAt,
      })
      .from(consentEvents)
      .innerJoin(members, eq(consentEvents.memberId, members.id))
      .where(eq(members.homeBranchId, branchId)),
  ]);

  const reminderDays = new Set(parseReminderDays(settings.reminderDays));
  const todayDate = startOfLocalDay(now);
  const entries: NewNotification[] = [];
  const consentByMember = new Map<number, typeof consentRows>();
  for (const event of consentRows) {
    const events = consentByMember.get(event.memberId) ?? [];
    events.push(event);
    consentByMember.set(event.memberId, events);
  }
  const marketingAllowed = new Set<number>();
  for (const [memberId, events] of consentByMember) {
    const validEvents = events.filter(
      (event): event is typeof event & { createdAt: Date } =>
        event.createdAt !== null,
    );
    if (getLatestConsent(validEvents).MARKETING) marketingAllowed.add(memberId);
  }

  for (const membership of packages) {
    const daysLeft = differenceInDays(membership.expireDate, now);
    if (!reminderDays.has(daysLeft)) continue;
    for (const channel of channels) {
      const delivery = getDeliveryState(channel, membership);
      entries.push({
        memberId: membership.memberId,
        memberPackageId: membership.id,
        type: "EXPIRY_REMINDER",
        channel,
        title: `แพ็กเกจเหลือ ${daysLeft} วัน`,
        message: `คุณ${membership.firstName} ${membership.lastName} แพ็กเกจจะหมดอายุในอีก ${daysLeft} วัน กรุณาติดต่อเพื่อต่ออายุ`,
        scheduledFor: todayDate,
        dedupeKey: `EXPIRY:${membership.id}:${daysLeft}:${channel}`,
        ...delivery,
      });
    }
  }

  const visitMap = new Map(lastVisits.filter((visit) => visit.memberId !== null).map((visit) => [visit.memberId!, visit.lastVisit]));
  for (const member of activeMembers) {
    const lastActivity = visitMap.get(member.id) ?? member.createdAt;
    if (!lastActivity || differenceInDays(now, lastActivity) < settings.inactivityDays) continue;
    const activityKey = toDateKey(lastActivity);
    for (const channel of channels) {
      if (channel !== "IN_APP" && !marketingAllowed.has(member.id)) continue;
      const delivery = getDeliveryState(channel, member);
      entries.push({
        memberId: member.id,
        type: "INACTIVITY",
        channel,
        title: "คิดถึงนะ กลับมาออกกำลังกายกัน",
        message: `คุณ${member.firstName} ${member.lastName} ไม่ได้เข้าใช้บริการเกิน ${settings.inactivityDays} วัน กลับมาดูแลสุขภาพด้วยกันอีกครั้ง`,
        scheduledFor: todayDate,
        dedupeKey: `INACTIVITY:${member.id}:${activityKey}:${settings.inactivityDays}:${channel}`,
        ...delivery,
      });
    }
  }

  const created = await insertNewNotifications(entries, executor);
  return { created, candidates: entries.length, message: created ? "สร้างรายการแจ้งเตือนแล้ว" : "ไม่มีรายการใหม่ในวันนี้" };
}

export class NotificationDeliveryError extends Error {
  /** เก็บสถานะ HTTP แยกจากข้อความทั่วไปเพื่อไม่เผยข้อมูลผู้รับหรือ provider */
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
    this.name = "NotificationDeliveryError";
  }
}

/** แปลงผล provider เป็นสถานะฐานข้อมูลและข้อความทั่วไปที่ไม่มี PII */
function deliveryUpdate(result: DeliveryResult) {
  if (result.outcome === "sent")
    return {
      status: "SENT" as const,
      failureKind: null,
      errorMessage: null,
      sentAt: new Date(),
    };
  if (result.outcome === "disabled")
    return {
      status: "SKIPPED" as const,
      failureKind: "CONFIG" as const,
      errorMessage: "ช่องทางยังไม่พร้อมใช้งาน",
      sentAt: null,
    };
  if (result.outcome === "retryable_failure")
    return {
      status: "FAILED" as const,
      failureKind: "RETRYABLE" as const,
      errorMessage: "ผู้ให้บริการไม่พร้อมใช้งานชั่วคราว",
      sentAt: null,
    };
  return {
    status: "FAILED" as const,
    failureKind: "PERMANENT" as const,
    errorMessage: "ผู้ให้บริการปฏิเสธคำขอ",
    sentAt: null,
  };
}

/** LINE ตรวจ policy ใน transaction; ทุก channel ใช้ fence กัน cancellation/reclaim ก่อนส่งและก่อน completion */
export async function processNotificationDelivery(
  notificationId: number,
  branchId: number,
) {
  // MySQL timestamp เก็บระดับวินาที จึงตัด millisecond เพื่อใช้เวลา claim เป็น token เปรียบเทียบได้ตรงกัน
  let claimTime = new Date(Math.floor(Date.now() / 1000) * 1000);
  const staleBefore = new Date(claimTime.getTime() - NOTIFICATION_CLAIM_LEASE_MS);
  const [record] = await db
    .select({
      id: notifications.id,
      memberId: notifications.memberId,
      channel: notifications.channel,
      recipient: notifications.recipient,
      title: notifications.title,
      message: notifications.message,
      status: notifications.status,
      failureKind: notifications.failureKind,
      attemptCount: notifications.attemptCount,
      lastAttemptAt: notifications.lastAttemptAt,
    })
    .from(notifications)
    .innerJoin(members, eq(notifications.memberId, members.id))
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(members.homeBranchId, branchId),
      ),
    )
    .limit(1);
  if (!record) throw new NotificationDeliveryError("ไม่พบรายการแจ้งเตือน", 404);
  let lineClaim: Extract<LineDeliveryClaim, { status: "PROCESSING" }> | undefined;
  if (record.channel === "LINE") {
    const settings = await getNotificationSettings();
    const result = await claimLineNotification(record.id, record.memberId, branchId, settings.isActive && settings.enableLine);
    if (!result) throw new NotificationDeliveryError("รายการนี้ไม่สามารถส่งซ้ำได้");
    if (result.status === "SKIPPED") return result;
    lineClaim = result;
    claimTime = result.claimedAt;
  }
  if (!lineClaim) {
    const claimable = canClaimDelivery(
      record.status,
      record.failureKind,
      record.attemptCount,
      record.lastAttemptAt,
      claimTime,
    );
    if (!claimable)
      throw new NotificationDeliveryError("รายการนี้ไม่สามารถส่งซ้ำได้");

    const claim = await db
      .update(notifications)
      .set({
        status: "PROCESSING",
        attemptCount: sql`${notifications.attemptCount} + 1`,
        lastAttemptAt: claimTime,
      })
      .where(
        and(
          eq(notifications.id, record.id),
          lt(notifications.attemptCount, 5),
          or(
            eq(notifications.status, "QUEUED"),
            and(
              eq(notifications.status, "FAILED"),
              eq(notifications.failureKind, "RETRYABLE"),
            ),
            and(
              eq(notifications.status, "SKIPPED"),
              eq(notifications.failureKind, "CONFIG"),
            ),
            and(
              eq(notifications.status, "PROCESSING"),
              or(
                isNull(notifications.lastAttemptAt),
                lte(notifications.lastAttemptAt, staleBefore),
              ),
            ),
          ),
        ),
      );
    if (claim[0].affectedRows !== 1)
      throw new NotificationDeliveryError("รายการกำลังถูกประมวลผล");
  }

  const claimedAttemptCount = lineClaim?.attemptCount ?? record.attemptCount + 1;
  const claimFence = and(
    eq(notifications.id, record.id),
    eq(notifications.status, "PROCESSING"),
    eq(notifications.lastAttemptAt, claimTime),
    eq(notifications.attemptCount, claimedAttemptCount),
  );
  // ปิด race หลัง commit ก่อน dispatch; HTTP ที่เริ่มไปแล้วเรียกคืนไม่ได้และไม่ถือ DB lock ระหว่างส่ง
  const [current] = await db.select({ id: notifications.id }).from(notifications).where(claimFence).limit(1);
  if (!current) throw new NotificationDeliveryError("lease ของรายการหมดอายุแล้ว");

  const environment = loadDeliveryEnvironment();
  const result = await deliverNotification(lineClaim ?? record, environment, {
    sendSmtp: sendSmtpNotification,
  });
  const update = deliveryUpdate(result);
  const completion = await db
    .update(notifications)
    .set(update)
    .where(claimFence);
  if (completion[0].affectedRows !== 1)
    throw new NotificationDeliveryError("lease ของรายการหมดอายุแล้ว");
  return {
    id: record.id,
    status: update.status,
    failureKind: update.failureKind,
    attemptCount: claimedAttemptCount,
  };
}

/** ส่งคิวของสาขาทีละรายการเพื่อลดการกระแทก provider และสรุปเฉพาะจำนวน */
export async function deliverQueuedNotifications(branchId: number, limit = 20) {
  const staleBefore = new Date(Date.now() - NOTIFICATION_CLAIM_LEASE_MS);
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .innerJoin(members, eq(notifications.memberId, members.id))
    .where(
      and(
        eq(members.homeBranchId, branchId),
        or(
          eq(notifications.status, "QUEUED"),
          and(
            eq(notifications.status, "FAILED"),
            eq(notifications.failureKind, "RETRYABLE"),
          ),
          and(
            eq(notifications.status, "SKIPPED"),
            eq(notifications.failureKind, "CONFIG"),
            ne(notifications.channel, "LINE"),
          ),
          and(
            eq(notifications.status, "PROCESSING"),
            or(
              isNull(notifications.lastAttemptAt),
              lte(notifications.lastAttemptAt, staleBefore),
            ),
          ),
        ),
        lt(notifications.attemptCount, 5),
      ),
    )
    .orderBy(notifications.createdAt)
    .limit(Math.min(Math.max(limit, 1), 50));

  const summary = { processed: 0, sent: 0, failed: 0, skipped: 0 };
  for (const row of rows) {
    try {
      const result = await processNotificationDelivery(row.id, branchId);
      summary.processed += 1;
      if (result.status === "SENT") summary.sent += 1;
      else if (result.status === "SKIPPED") summary.skipped += 1;
      else summary.failed += 1;
    } catch (error) {
      if (!(error instanceof NotificationDeliveryError)) throw error;
    }
  }
  return summary;
}

/** คืน readiness ที่ปลอดภัยสำหรับหน้า Admin โดยไม่คืน URL, token, username หรือ password */
export function getNotificationProviderHealth() {
  return getProviderHealth(loadDeliveryEnvironment());
}

/** บันทึกคำเตือนวันหมดอายุที่แสดง ณ จุดสแกนลงในประวัติแบบไม่ซ้ำภายในวันเดียวกัน */
export async function recordScanWarning({
  memberId,
  memberPackageId,
  daysLeft,
  memberName,
  now = new Date(),
  executor,
}: {
  memberId: number;
  memberPackageId: number;
  daysLeft: number;
  memberName: string;
  now?: Date;
  executor?: DbTransaction;
}) {
  const dateKey = toDateKey(now);
  return insertNewNotifications([{
    memberId,
    memberPackageId,
    type: "SCAN_WARNING",
    channel: "IN_APP",
    status: "SENT",
    title: `แจ้งเตือน ณ จุดสแกน: เหลือ ${daysLeft} วัน`,
    message: `${memberName} ได้รับแจ้งเตือนให้ต่ออายุแพ็กเกจ ณ จุดสแกน`,
    scheduledFor: startOfLocalDay(now),
    dedupeKey: `SCAN:${memberPackageId}:${dateKey}`,
    sentAt: now,
  }], executor);
}
