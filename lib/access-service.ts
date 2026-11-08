import "server-only";

import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { accessLogs, cardPool, memberAccessTokens, memberPackages, members } from "@/db/schema";
import { evaluateAccessPolicy } from "@/lib/access-policy";
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

/** บันทึกผลปฏิเสธทุกกรณีใน transaction เดียวกับการตรวจสิทธิ์ */
async function rejectAccess(
  tx: DbTransaction,
  branchId: number,
  serial: string,
  reason: string,
  memberId?: number,
): Promise<AccessScanResult> {
  await tx.insert(accessLogs).values({
    branchId,
    memberId,
    serial,
    result: "REJECTED",
    reason,
  });
  return { result: "REJECTED", reason };
}

/** ตรวจบัตร/แพ็กเกจในสาขาเดียวและคืน member ID ให้ UI อ่านรูปผ่าน gateway ก่อน route เรียก hardware */
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
    return rejectAccess(tx, branchId, auditSerial, "ไม่พบบัตรหรือ QR หมดอายุ");

  const [member] = await tx
    .select()
    .from(members)
    .where(
      and(eq(members.id, memberId), eq(members.homeBranchId, branchId)),
    )
    .limit(1);
  if (!member)
    return rejectAccess(tx, branchId, auditSerial, "ไม่พบสมาชิกในสาขานี้");

  const [memberPackage] = await tx
    .select()
    .from(memberPackages)
    .where(
      and(
        eq(memberPackages.memberId, member.id),
        eq(memberPackages.status, "ACTIVE"),
      ),
    )
    .orderBy(desc(memberPackages.expireDate))
    .limit(1);
  const decision = evaluateAccessPolicy({
    memberStatus: member.status,
    packageStatus: memberPackage?.status ?? null,
    startDate: memberPackage?.startDate ?? null,
    expireDate: memberPackage?.expireDate ?? null,
    now,
  });
  if (!decision.approved)
    return rejectAccess(
      tx,
      branchId,
      auditSerial,
      decision.reason,
      member.id,
    );

  await tx.insert(accessLogs).values({
    branchId,
    memberId: member.id,
    serial: auditSerial,
    result: "APPROVED",
    reason: null,
  });
  if (decision.warning && memberPackage) {
    await recordScanWarning({
      memberId: member.id,
      memberPackageId: memberPackage.id,
      daysLeft: decision.daysLeft,
      memberName: `${member.firstName} ${member.lastName}`,
      now,
      executor: tx,
    }).catch(() => console.error("scan warning could not be recorded"));
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
