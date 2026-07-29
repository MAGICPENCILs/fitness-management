import "server-only";

import { and, desc, eq, inArray, isNotNull, max } from "drizzle-orm";
import { db } from "@/db";
import {
  accessLogs,
  memberPackages,
  members,
  NewNotification,
  notifications,
  notificationSettings,
} from "@/db/schema";

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
export async function getNotificationSettings() {
  const [settings] = await db.select().from(notificationSettings).where(eq(notificationSettings.id, 1)).limit(1);
  return settings ?? defaultNotificationSettings;
}

/** โหลดประวัติการแจ้งเตือนล่าสุดพร้อมชื่อสมาชิกสำหรับหน้า Admin */
export async function getNotificationHistory(limit = 50) {
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
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .innerJoin(members, eq(notifications.memberId, members.id))
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
    errorMessage: "รอเชื่อมต่อผู้ให้บริการส่งข้อความ",
    sentAt: null,
  };
}

/** คืนรายการช่องทางที่เปิดใช้งานจากค่าตั้งระบบ */
function getEnabledChannels(settings: Awaited<ReturnType<typeof getNotificationSettings>>) {
  const channels: NotificationChannel[] = [];
  if (settings.enableInApp) channels.push("IN_APP");
  if (settings.enableSms) channels.push("SMS");
  if (settings.enableLine) channels.push("LINE");
  if (settings.enableEmail) channels.push("EMAIL");
  return channels;
}

/** บันทึกรายการใหม่เท่านั้น โดยใช้ dedupe key ป้องกันสมาชิกได้รับข้อความเดิมซ้ำ */
async function insertNewNotifications(entries: NewNotification[]) {
  if (!entries.length) return 0;
  const existing = await db
    .select({ dedupeKey: notifications.dedupeKey })
    .from(notifications)
    .where(inArray(notifications.dedupeKey, entries.map((entry) => entry.dedupeKey)));
  const existingKeys = new Set(existing.map((entry) => entry.dedupeKey));
  const newEntries = entries.filter((entry) => !existingKeys.has(entry.dedupeKey));
  if (!newEntries.length) return 0;

  // INSERT IGNORE ปิดช่องว่างของ race condition หากมีตัวประมวลผลสองรอบเริ่มพร้อมกัน
  const result = await db.insert(notifications).ignore().values(newEntries);
  return result[0].affectedRows;
}

/** สร้างแจ้งเตือนวันหมดอายุและสมาชิกขาดการใช้งานตามค่าตั้งระบบ */
export async function generateNotifications(now = new Date()) {
  const settings = await getNotificationSettings();
  if (!settings.isActive) return { created: 0, candidates: 0, message: "ระบบแจ้งเตือนถูกปิดใช้งาน" };

  const channels = getEnabledChannels(settings);
  if (!channels.length) return { created: 0, candidates: 0, message: "ยังไม่ได้เปิดช่องทางแจ้งเตือน" };

  const [packages, activeMembers, lastVisits] = await Promise.all([
    db
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
      .where(and(eq(memberPackages.status, "ACTIVE"), eq(members.status, "ACTIVE"))),
    db
      .select({
        id: members.id,
        firstName: members.firstName,
        lastName: members.lastName,
        phone: members.phone,
        email: members.email,
        createdAt: members.createdAt,
      })
      .from(members)
      .where(eq(members.status, "ACTIVE")),
    db
      .select({ memberId: accessLogs.memberId, lastVisit: max(accessLogs.scannedAt) })
      .from(accessLogs)
      .where(and(eq(accessLogs.result, "APPROVED"), isNotNull(accessLogs.memberId)))
      .groupBy(accessLogs.memberId),
  ]);

  const reminderDays = new Set(parseReminderDays(settings.reminderDays));
  const todayDate = startOfLocalDay(now);
  const entries: NewNotification[] = [];

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

  const created = await insertNewNotifications(entries);
  return { created, candidates: entries.length, message: created ? "สร้างรายการแจ้งเตือนแล้ว" : "ไม่มีรายการใหม่ในวันนี้" };
}

/** บันทึกคำเตือนวันหมดอายุที่แสดง ณ จุดสแกนลงในประวัติแบบไม่ซ้ำภายในวันเดียวกัน */
export async function recordScanWarning({
  memberId,
  memberPackageId,
  daysLeft,
  memberName,
  now = new Date(),
}: {
  memberId: number;
  memberPackageId: number;
  daysLeft: number;
  memberName: string;
  now?: Date;
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
  }]);
}
