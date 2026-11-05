import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  authLoginLimits,
  consentEvents,
  branches,
  memberAccounts,
  memberApplications,
  memberSessions,
  members,
} from "@/db/schema";
import { runAuditedMutation, writeAudit } from "@/lib/audit-service";
import { authRepository } from "@/lib/auth/auth-repository";
import { LOGIN_LIMIT_LOCK_SECONDS } from "@/lib/auth/constants";
import {
  createAuthSubjectFingerprint,
} from "@/lib/auth/request-security";
import type { RequestFingerprintInput } from "@/lib/auth/types";
import {
  hashPassword,
  validatePassword,
  verifyPasswordOrDummy,
} from "@/lib/auth/password";
import {
  createMemberSessionToken,
  hashMemberSessionToken,
  MEMBER_SESSION_SECONDS,
} from "@/lib/member-auth/session";
import type { ActorContext } from "@/lib/rbac";
import { ACTIVE_PRIVACY_POLICY_VERSION } from "@/lib/consent-policy";

export class MemberPortalError extends Error {
  /** เก็บรหัสคงที่เพื่อให้ public route ตอบข้อความกลางและไม่เปิดเผยว่ามีอีเมลอยู่หรือไม่ */
  constructor(public code: string) {
    super(code);
    this.name = "MemberPortalError";
  }
}

/** normalize อีเมลแบบเดียวกันทั้งสมัครและ Login เพื่อรักษา unique boundary */
export function normalizeMemberEmail(email: string) {
  return email.trim().toLowerCase();
}

/** ตรวจ duplicate-key จากรหัสมาตรฐานของ MySQL โดยไม่ผูกกับข้อความ error ที่เปลี่ยนได้ */
function isDuplicateEntryError(error: unknown) {
  return typeof error === "object" && error !== null &&
    (("code" in error && error.code === "ER_DUP_ENTRY") || ("errno" in error && error.errno === 1062));
}

/** รับใบสมัครใหม่หรือเปิดใบสมัครที่เคยถูกปฏิเสธอีกครั้ง โดยไม่เปลี่ยนบัญชีหรือใบสมัครที่ยังใช้งาน */
export async function createMemberApplication(input: {
  branchId: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  password: string;
  servicePrivacyConsent: true;
  marketingConsent: boolean;
}) {
  const policy = validatePassword(input.password);
  if (!policy.valid) throw new MemberPortalError("PASSWORD_POLICY");
  const [branch] = await db.select({ id: branches.id }).from(branches).where(and(eq(branches.id, input.branchId), eq(branches.status, "ACTIVE"))).limit(1);
  if (!branch) throw new MemberPortalError("BRANCH_NOT_AVAILABLE");
  const passwordHash = await hashPassword(input.password);
  const email = normalizeMemberEmail(input.email);
  const values = {
    branchId: input.branchId,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    phone: input.phone.trim(),
    email,
    passwordHash,
    servicePrivacyConsent: true as const,
    marketingConsent: input.marketingConsent,
    policyVersion: ACTIVE_PRIVACY_POLICY_VERSION,
    status: "PENDING" as const,
  };
  try {
    await db.transaction(async (tx) => {
      const [account] = await tx.select({ id: memberAccounts.id }).from(memberAccounts).where(eq(memberAccounts.email, email)).limit(1).for("update");
      const [application] = await tx.select({ id: memberApplications.id, status: memberApplications.status }).from(memberApplications).where(eq(memberApplications.email, email)).limit(1).for("update");
      if (account || (application && application.status !== "REJECTED")) return;
      if (!application) {
        await tx.insert(memberApplications).values(values);
        return;
      }
      await tx.update(memberApplications).set({
        ...values,
        reviewNote: null,
        reviewedByStaffId: null,
        reviewedAt: null,
        memberId: null,
        createdAt: new Date(),
      }).where(eq(memberApplications.id, application.id));
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) return;
    throw error;
  }
}

/** โหลดใบสมัครเฉพาะสาขาที่ผู้ดูแลกำลังทำงานและไม่คืน password hash */
export async function getMemberApplications(branchId: number) {
  return db
    .select({
      id: memberApplications.id,
      firstName: memberApplications.firstName,
      lastName: memberApplications.lastName,
      phone: memberApplications.phone,
      email: memberApplications.email,
      status: memberApplications.status,
      reviewNote: memberApplications.reviewNote,
      createdAt: memberApplications.createdAt,
    })
    .from(memberApplications)
    .where(eq(memberApplications.branchId, branchId))
    .orderBy(desc(memberApplications.createdAt));
}

/** อนุมัติใบสมัครภายใน transaction เดียว แล้วจึงสร้าง member/account/consent โดยยังไม่สร้างแพ็กเกจ */
export async function reviewMemberApplication(
  actor: ActorContext,
  branchId: number,
  applicationId: number,
  decision: "APPROVE" | "REJECT",
  reviewNote?: string,
) {
  return runAuditedMutation<number>(
    {
      actorStaffId: actor.staffId,
      branchId,
      action: decision === "APPROVE" ? "MEMBER_APPLICATION_APPROVED" : "MEMBER_APPLICATION_REJECTED",
      entityType: "MEMBER_APPLICATION",
      entityId: applicationId,
    },
    async (tx) => {
      const [application] = await tx
        .select()
        .from(memberApplications)
        .where(and(eq(memberApplications.id, applicationId), eq(memberApplications.branchId, branchId)))
        .limit(1)
        .for("update");
      if (!application) throw new MemberPortalError("APPLICATION_NOT_FOUND");
      if (application.status !== "PENDING") throw new MemberPortalError("APPLICATION_ALREADY_REVIEWED");
      if (decision === "REJECT") {
        await tx.update(memberApplications).set({ status: "REJECTED", reviewNote: reviewNote || null, reviewedByStaffId: actor.staffId, reviewedAt: new Date() }).where(eq(memberApplications.id, application.id));
        return application.id;
      }
      const memberResult = await tx.insert(members).values({
        homeBranchId: branchId,
        memberCode: `WEB${String(application.id).padStart(8, "0")}`,
        firstName: application.firstName,
        lastName: application.lastName,
        phone: application.phone,
        email: application.email,
        status: "ACTIVE",
      });
      const memberId = memberResult[0].insertId;
      await tx.insert(memberAccounts).values({ memberId, email: application.email, passwordHash: application.passwordHash, status: "ACTIVE" });
      await tx.insert(consentEvents).values([
        { memberId, branchId, recordedByStaffId: actor.staffId, consentType: "SERVICE_PRIVACY", action: "GRANTED", policyVersion: application.policyVersion, source: "ONLINE" },
        { memberId, branchId, recordedByStaffId: actor.staffId, consentType: "MARKETING", action: application.marketingConsent ? "GRANTED" : "WITHDRAWN", policyVersion: application.policyVersion, source: "ONLINE" },
      ]);
      await tx.update(memberApplications).set({ status: "APPROVED", reviewNote: reviewNote || null, reviewedByStaffId: actor.staffId, reviewedAt: new Date(), memberId }).where(eq(memberApplications.id, application.id));
      return application.id;
    },
  );
}

/** ตรวจ rate limit/credential พร้อม audit และสร้าง opaque Member session อายุ 7 วันแบบ atomic เมื่อสำเร็จ */
export async function loginMember(email: string, password: string, request: RequestFingerprintInput) {
  const normalized = normalizeMemberEmail(email);
  const now = new Date();
  const accountSubjectHash = createAuthSubjectFingerprint(`MEMBER:${normalized}`);
  const ipSubjectHash = request.ipFingerprint ? createAuthSubjectFingerprint(`MEMBER_IP:${request.ipFingerprint}`) : null;
  const limitChecks = await Promise.all([
    authRepository.checkLimit("ACCOUNT", accountSubjectHash, now),
    ...(ipSubjectHash ? [authRepository.checkLimit("IP", ipSubjectHash, now)] : []),
  ]);
  if (limitChecks.some((check) => check.blocked)) {
    await writeAudit(db, { actorStaffId: null, branchId: null, action: "MEMBER_LOGIN_RATE_LIMITED", entityType: "MEMBER_AUTH", result: "DENIED", metadata: { scope: "MEMBER" } });
    throw new MemberPortalError("RATE_LIMITED");
  }
  const [account] = await db
    .select({ id: memberAccounts.id, passwordHash: memberAccounts.passwordHash, accountStatus: memberAccounts.status, memberStatus: members.status, branchId: members.homeBranchId })
    .from(memberAccounts)
    .innerJoin(members, eq(memberAccounts.memberId, members.id))
    .where(eq(memberAccounts.email, normalized))
    .limit(1);
  const valid = await verifyPasswordOrDummy(account?.passwordHash ?? null, password);
  if (!valid || !account || account.accountStatus !== "ACTIVE" || account.memberStatus === "CANCELLED") {
    const accountDecision = await authRepository.consumeFailure("ACCOUNT", accountSubjectHash, now);
    const ipDecision = ipSubjectHash ? await authRepository.consumeFailure("IP", ipSubjectHash, now) : null;
    const blocked = accountDecision.blocked || Boolean(ipDecision?.blocked);
    await writeAudit(db, { actorStaffId: null, branchId: account?.branchId ?? null, action: blocked ? "MEMBER_LOGIN_RATE_LIMITED" : "MEMBER_LOGIN_FAILED", entityType: "MEMBER_AUTH", entityId: account?.id, result: blocked ? "DENIED" : "FAILED", metadata: { scope: "MEMBER" } });
    if (blocked) throw new MemberPortalError("RATE_LIMITED");
    throw new MemberPortalError("INVALID_CREDENTIALS");
  }
  const token = createMemberSessionToken();
  const expiresAt = new Date(now.getTime() + MEMBER_SESSION_SECONDS * 1000);
  await db.transaction(async (tx) => {
    await tx.delete(authLoginLimits).where(and(eq(authLoginLimits.scope, "ACCOUNT"), eq(authLoginLimits.subjectHash, accountSubjectHash)));
    await tx.insert(memberSessions).values({ memberAccountId: account.id, tokenHash: hashMemberSessionToken(token), expiresAt, lastSeenAt: now });
    await writeAudit(tx, { actorStaffId: null, branchId: account.branchId, action: "MEMBER_LOGIN_SUCCESS", entityType: "MEMBER_AUTH", entityId: account.id, result: "SUCCESS", metadata: { scope: "MEMBER" } });
  });
  return { token, expiresAt };
}

export { LOGIN_LIMIT_LOCK_SECONDS as MEMBER_LOGIN_LOCK_SECONDS };

/** คืนรายการสาขาที่เปิดใช้งานสำหรับฟอร์มสมัคร โดยไม่เปิดข้อมูลภายในอื่น */
export async function getPublicBranches() {
  return db.select({ id: branches.id, name: branches.name }).from(branches).where(eq(branches.status, "ACTIVE")).orderBy(asc(branches.name));
}
