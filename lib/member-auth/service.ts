import "server-only";

import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import {
  accessLogs,
  classBookings,
  fitnessClasses,
  memberAccounts,
  memberPackages,
  memberSessions,
  members,
  packages,
} from "@/db/schema";
import {
  hashMemberSessionToken,
  isMemberSessionActive,
  MEMBER_SESSION_COOKIE,
} from "@/lib/member-auth/session";

export class MemberSessionError extends Error {
  constructor() {
    super("MEMBER_SESSION_REQUIRED");
    this.name = "MemberSessionError";
  }
}

/** ตรวจ opaque Member session กับฐานข้อมูลทุกครั้งและไม่อ่าน Staff cookie/claims */
export async function requireMemberSession() {
  const token = (await cookies()).get(MEMBER_SESSION_COOKIE)?.value;
  if (!token) throw new MemberSessionError();
  const now = new Date();
  const [row] = await db
    .select({
      sessionId: memberSessions.id,
      expiresAt: memberSessions.expiresAt,
      revokedAt: memberSessions.revokedAt,
      accountId: memberAccounts.id,
      accountStatus: memberAccounts.status,
      memberId: members.id,
      branchId: members.homeBranchId,
      memberCode: members.memberCode,
      firstName: members.firstName,
      lastName: members.lastName,
      memberStatus: members.status,
    })
    .from(memberSessions)
    .innerJoin(memberAccounts, eq(memberSessions.memberAccountId, memberAccounts.id))
    .innerJoin(members, eq(memberAccounts.memberId, members.id))
    .where(and(eq(memberSessions.tokenHash, hashMemberSessionToken(token)), gt(memberSessions.expiresAt, now), isNull(memberSessions.revokedAt)))
    .limit(1);
  if (!row || !isMemberSessionActive(row.expiresAt, row.revokedAt, now) || row.accountStatus !== "ACTIVE" || row.memberStatus === "CANCELLED")
    throw new MemberSessionError();
  return row;
}

/** revoke session ปัจจุบันด้วย hash ของ cookie โดยไม่ต้องคืนข้อมูลบัญชี */
export async function logoutMemberSession(token: string | undefined) {
  if (!token) return;
  await db.update(memberSessions).set({ revokedAt: new Date() }).where(and(eq(memberSessions.tokenHash, hashMemberSessionToken(token)), isNull(memberSessions.revokedAt)));
}

/** โหลดเฉพาะข้อมูล self-service ของสมาชิกใน session ปัจจุบัน */
export async function getMemberPortalDashboard(memberId: number) {
  const [packageRows, visits, bookings] = await Promise.all([
    db.select({ id: memberPackages.id, packageName: packages.name, startDate: memberPackages.startDate, expireDate: memberPackages.expireDate, status: memberPackages.status }).from(memberPackages).innerJoin(packages, eq(memberPackages.packageId, packages.id)).where(eq(memberPackages.memberId, memberId)).orderBy(desc(memberPackages.expireDate)),
    db.select({ id: accessLogs.id, result: accessLogs.result, reason: accessLogs.reason, scannedAt: accessLogs.scannedAt }).from(accessLogs).where(eq(accessLogs.memberId, memberId)).orderBy(desc(accessLogs.scannedAt)).limit(20),
    db.select({ id: classBookings.id, status: classBookings.status, className: fitnessClasses.name, classDate: fitnessClasses.classDate, startTime: fitnessClasses.startTime, room: fitnessClasses.room }).from(classBookings).innerJoin(fitnessClasses, eq(classBookings.classId, fitnessClasses.id)).where(eq(classBookings.memberId, memberId)).orderBy(desc(fitnessClasses.classDate)).limit(20),
  ]);
  return { packages: packageRows, visits, bookings };
}
