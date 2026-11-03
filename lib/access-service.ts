import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { accessLogs, cardPool, memberPackages, members } from "@/db/schema";
import { evaluateAccessPolicy } from "@/lib/access-policy";
import type { DbTransaction } from "@/lib/audit-service";
import { recordScanWarning } from "@/lib/notification-engine";

export type AccessScanResult =
  | { result: "REJECTED"; reason: string }
  | {
      result: "APPROVED";
      member: {
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

/** ตรวจบัตร สมาชิก และแพ็กเกจภายในสาขาเดียว แล้ว commit log ก่อน route เรียก hardware */
export async function processCardScan(
  tx: DbTransaction,
  branchId: number,
  serial: string,
  now = new Date(),
): Promise<AccessScanResult> {
  const [card] = await tx
    .select({ memberId: cardPool.memberId, status: cardPool.status })
    .from(cardPool)
    .where(and(eq(cardPool.serial, serial), eq(cardPool.branchId, branchId)))
    .limit(1);
  if (!card || card.status !== "IN_USE" || !card.memberId)
    return rejectAccess(
      tx,
      branchId,
      serial,
      "ไม่พบบัตรหรือบัตรไม่ได้ใช้งาน",
    );

  const [member] = await tx
    .select()
    .from(members)
    .where(
      and(eq(members.id, card.memberId), eq(members.homeBranchId, branchId)),
    )
    .limit(1);
  if (!member)
    return rejectAccess(tx, branchId, serial, "ไม่พบสมาชิกในสาขานี้");

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
      serial,
      decision.reason,
      member.id,
    );

  await tx.insert(accessLogs).values({
    branchId,
    memberId: member.id,
    serial,
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
