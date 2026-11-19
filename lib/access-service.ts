import "server-only";

import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { accessLogs, accessSettings, cardPool, memberAccessTokens, memberPackages, members, packages } from "@/db/schema";
import { evaluateAccessPolicy, storedDateKey, thaiDateKey } from "@/lib/access-policy";
import type { DbTransaction } from "@/lib/audit-service";
import { recordScanWarning } from "@/lib/notification-engine";
import { hashMemberAccessToken } from "@/lib/member-token";

export type AccessScanResult =
  | { result: "REJECTED"; reason: string }
  | {
      result: "APPROVED";
      member: {
        id: number;
        memberCode: string;
        firstName: string;
        lastName: string;
        photoUrl: string | null;
        status: string;
        expireDate: string | Date;
        daysLeft: number;
      };
      warning: string | null;
    };

export const defaultAccessSettings = { id: 1, graceDays: 3 } as const;

/** โหลด singleton setting และ fallback อย่างปลอดภัยเมื่อยังไม่มีแถวตั้งค่า */
export async function getAccessSettings(executor: Pick<typeof db, "select"> = db) {
  const [settings] = await executor.select({ id: accessSettings.id, graceDays: accessSettings.graceDays })
    .from(accessSettings).where(eq(accessSettings.id, 1)).limit(1);
  return settings ?? defaultAccessSettings;
}

/** บันทึกผลปฏิเสธทุกกรณีใน transaction เดียวกับการตรวจสิทธิ์ */
async function rejectAccess(
  tx: DbTransaction,
  branchId: number,
  serial: string,
  reason: string,
  now: Date,
  memberId?: number,
): Promise<AccessScanResult> {
  await tx.insert(accessLogs).values({
    branchId,
    memberId,
    serial,
    result: "REJECTED",
    reason,
    scannedAt: now,
  });
  return { result: "REJECTED", reason };
}

/** ยอมรับเฉพาะ duplicate จาก MySQL เพื่อแปลงการแข่งขันใช้สิทธิ์ DAILY เป็นผลปฏิเสธปกติ */
function isDuplicateEntryError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if (("code" in error && error.code === "ER_DUP_ENTRY") || ("errno" in error && error.errno === 1062)) return true;
  return "cause" in error && isDuplicateEntryError(error.cause);
}

/** ตรวจบัตร/แพ็กเกจในสาขาเดียว โดยล็อกสมาชิกก่อนเขียน audit/notification เพื่อไม่ให้ deadlock ถูกกลืนแล้วเปิดประตูโดยไม่มี log */
export async function processCardScan(
  tx: DbTransaction,
  branchId: number,
  serial: string,
  now = new Date(),
): Promise<AccessScanResult> {
  let memberId: number | null = null;
  let auditSerial = serial;
  if (serial.startsWith("FQR.")) {
    const tokenHash = hashMemberAccessToken(serial);
    const [token] = await tx
      .select({ memberId: memberAccessTokens.memberId })
      .from(memberAccessTokens)
      .where(
        and(
          eq(memberAccessTokens.tokenHash, tokenHash),
          eq(memberAccessTokens.branchId, branchId),
          isNull(memberAccessTokens.revokedAt),
          gt(memberAccessTokens.expiresAt, now),
        ),
      )
      .limit(1);
    memberId = token?.memberId ?? null;
    auditSerial = `QR:${tokenHash.slice(0, 12)}`;
  } else {
    const [card] = await tx
      .select({ memberId: cardPool.memberId, status: cardPool.status })
      .from(cardPool)
      .where(and(eq(cardPool.serial, serial), eq(cardPool.branchId, branchId)))
      .limit(1);
    memberId = card?.status === "IN_USE" ? card.memberId : null;
  }
  if (!memberId)
    return rejectAccess(tx, branchId, auditSerial, "ไม่พบบัตรหรือ QR หมดอายุ", now);

  const [member] = await tx
    .select()
    .from(members)
    .where(
      and(eq(members.id, memberId), eq(members.homeBranchId, branchId)),
    )
    .limit(1)
    .for("update");
  if (!member)
    return rejectAccess(tx, branchId, auditSerial, "ไม่พบสมาชิกในสาขานี้", now);

  const packageCandidates = await tx
    .select({
      id: memberPackages.id,
      status: memberPackages.status,
      startDate: memberPackages.startDate,
      expireDate: memberPackages.expireDate,
      packageType: packages.type,
    })
    .from(memberPackages)
    .innerJoin(packages, eq(memberPackages.packageId, packages.id))
    .where(
      and(
        eq(memberPackages.memberId, member.id),
        eq(memberPackages.status, "ACTIVE"),
      ),
    )
    .orderBy(desc(memberPackages.expireDate));
  const today = thaiDateKey(now);
  // ตัดแพ็กเกจต่ออายุในอนาคตก่อนเลือกวันหมดอายุไกลสุด เพื่อไม่ให้บังสิทธิ์ที่กำลังใช้งาน
  const memberPackage = packageCandidates.find(candidate => storedDateKey(candidate.startDate) <= today)
    ?? packageCandidates[0];
  const [settings] = await tx.select({ graceDays: accessSettings.graceDays })
    .from(accessSettings).where(eq(accessSettings.id, 1)).limit(1);
  const decision = evaluateAccessPolicy({
    memberStatus: member.status,
    packageStatus: memberPackage?.status ?? null,
    startDate: memberPackage?.startDate ?? null,
    expireDate: memberPackage?.expireDate ?? null,
    graceDays: settings?.graceDays ?? 3,
    now,
  });
  if (!decision.approved)
    return rejectAccess(
      tx,
      branchId,
      auditSerial,
      decision.reason,
      now,
      member.id,
    );

  if (memberPackage?.packageType === "DAILY") {
    try {
      // unique key ระดับฐานข้อมูลปิดการแข่งขันจากหลายจุดสแกน โดยยึดวันที่ประเทศไทยไม่ขึ้นกับ timezone ของ MySQL
      await tx.insert(accessLogs).values({
        branchId,
        memberId: member.id,
        serial: auditSerial,
        result: "APPROVED",
        reason: null,
        scannedAt: now,
        dailyUseDate: today,
      });
    } catch (error) {
      if (!isDuplicateEntryError(error)) throw error;
      return rejectAccess(tx, branchId, auditSerial, "สิทธิ์รายวันถูกใช้แล้ววันนี้", now, member.id);
    }
  } else {
    await tx.insert(accessLogs).values({
      branchId,
      memberId: member.id,
      serial: auditSerial,
      result: "APPROVED",
      reason: null,
      scannedAt: now,
    });
  }
  if (decision.warning && memberPackage) {
    await recordScanWarning({
      memberId: member.id,
      memberPackageId: memberPackage.id,
      daysLeft: decision.daysLeft,
      memberName: `${member.firstName} ${member.lastName}`,
      now,
      executor: tx,
    });
  }
  return {
    result: "APPROVED",
    member: {
      id: member.id,
      memberCode: member.memberCode,
      firstName: member.firstName,
      lastName: member.lastName,
      photoUrl: member.photoUrl,
      status: member.status,
      expireDate: memberPackage!.expireDate,
      daysLeft: decision.daysLeft,
    },
    warning: decision.warning,
  };
}
