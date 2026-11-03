import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  consentEvents,
  branches,
  memberAccounts,
  memberApplications,
  memberSessions,
  members,
} from "@/db/schema";
import { runAuditedMutation } from "@/lib/audit-service";
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

/** รับใบสมัครแบบ pending เท่านั้น; ยังไม่สร้าง member/account หรือสิทธิ์เข้าใช้บริการ */
export async function createMemberApplication(input: {
  branchId: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  password: string;
  servicePrivacyConsent: true;
  marketingConsent: boolean;
  policyVersion: string;
}) {
  const policy = validatePassword(input.password);
  if (!policy.valid) throw new MemberPortalError("PASSWORD_POLICY");
  const [branch] = await db.select({ id: branches.id }).from(branches).where(and(eq(branches.id, input.branchId), eq(branches.status, "ACTIVE"))).limit(1);
  if (!branch) throw new MemberPortalError("BRANCH_NOT_AVAILABLE");
  const passwordHash = await hashPassword(input.password);
  try {
    await db.insert(memberApplications).values({
      branchId: input.branchId,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone.trim(),
      email: normalizeMemberEmail(input.email),
      passwordHash,
      servicePrivacyConsent: true,
      marketingConsent: input.marketingConsent,
      policyVersion: input.policyVersion,
      status: "PENDING",
    });
  } catch (error) {
    if (error instanceof Error && /duplicate/i.test(error.message)) return;
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

/** ตรวจ credential ด้วย dummy hash เมื่อไม่พบบัญชี แล้วสร้าง opaque Member session อายุ 7 วัน */
export async function loginMember(email: string, password: string) {
  const normalized = normalizeMemberEmail(email);
  const [account] = await db
    .select({ id: memberAccounts.id, passwordHash: memberAccounts.passwordHash, accountStatus: memberAccounts.status, memberStatus: members.status })
    .from(memberAccounts)
    .innerJoin(members, eq(memberAccounts.memberId, members.id))
    .where(eq(memberAccounts.email, normalized))
    .limit(1);
  const valid = await verifyPasswordOrDummy(account?.passwordHash ?? null, password);
  if (!valid || !account || account.accountStatus !== "ACTIVE" || account.memberStatus === "CANCELLED")
    throw new MemberPortalError("INVALID_CREDENTIALS");
  const token = createMemberSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + MEMBER_SESSION_SECONDS * 1000);
  await db.insert(memberSessions).values({ memberAccountId: account.id, tokenHash: hashMemberSessionToken(token), expiresAt, lastSeenAt: now });
  return { token, expiresAt };
}

/** คืนรายการสาขาที่เปิดใช้งานสำหรับฟอร์มสมัคร โดยไม่เปิดข้อมูลภายในอื่น */
export async function getPublicBranches() {
  return db.select({ id: branches.id, name: branches.name }).from(branches).where(eq(branches.status, "ACTIVE")).orderBy(asc(branches.name));
}
