import "server-only";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import {
  freezeRecords,
  memberAccessTokens,
  memberPackages,
  members,
} from "@/db/schema";
import { runAuditedMutation, writeAudit } from "@/lib/audit-service";
import { db } from "@/db";
import {
  assertFreezeAllowance,
  extendExpiryDate,
  MembershipLifecycleError,
} from "@/lib/membership-lifecycle";
import { createMemberAccessToken } from "@/lib/member-token";
import type { ActorContext } from "@/lib/rbac";

/** เริ่ม Freeze ภายใต้ row locks และตรวจโควตา 30 วันของปีปฏิทินเดียวกัน */
export async function freezeMembership(
  actor: ActorContext,
  branchId: number,
  input: { memberId: number; memberPackageId: number; days: number; reason: string },
) {
  assertFreezeAllowance(0, input.days);
  const year = new Date().getFullYear();
  return runAuditedMutation<number>(
    {
      actorStaffId: actor.staffId,
      branchId,
      action: "MEMBERSHIP_FROZEN",
      entityType: "FREEZE_RECORD",
      metadata: { memberId: input.memberId },
      success: (id) => ({ entityId: id }),
    },
    async (tx) => {
      const [[member], [memberPackage], [active], [usage]] = await Promise.all([
        tx.select().from(members).where(and(eq(members.id, input.memberId), eq(members.homeBranchId, branchId))).limit(1).for("update"),
        tx.select().from(memberPackages).where(and(eq(memberPackages.id, input.memberPackageId), eq(memberPackages.memberId, input.memberId))).limit(1).for("update"),
        tx.select({ id: freezeRecords.id }).from(freezeRecords).where(and(eq(freezeRecords.memberId, input.memberId), eq(freezeRecords.activeKey, "ACTIVE"))).limit(1).for("update"),
        tx.select({ days: sql<number>`coalesce(sum(${freezeRecords.requestedDays}), 0)` }).from(freezeRecords).where(and(eq(freezeRecords.memberId, input.memberId), eq(freezeRecords.freezeYear, year), ne(freezeRecords.status, "CANCELLED"))),
      ]);
      if (!member || member.status !== "ACTIVE")
        throw new MembershipLifecycleError("MEMBER_NOT_ACTIVE");
      if (!memberPackage || memberPackage.status !== "ACTIVE")
        throw new MembershipLifecycleError("PACKAGE_NOT_ACTIVE");
      if (active) throw new MembershipLifecycleError("FREEZE_ALREADY_ACTIVE");
      assertFreezeAllowance(Number(usage?.days ?? 0), input.days);

      const result = await tx.insert(freezeRecords).values({
        memberId: input.memberId,
        memberPackageId: input.memberPackageId,
        branchId,
        requestedDays: input.days,
        freezeYear: year,
        reason: input.reason,
        status: "ACTIVE",
        activeKey: "ACTIVE",
        startedAt: new Date(),
        createdByStaffId: actor.staffId,
      });
      await Promise.all([
        tx.update(members).set({ status: "FROZEN" }).where(eq(members.id, input.memberId)),
        tx.update(memberPackages).set({ status: "FROZEN" }).where(eq(memberPackages.id, input.memberPackageId)),
      ]);
      return result[0].insertId;
    },
  );
}

/** จบ Freeze แล้วต่อวันหมดอายุตามจำนวนวันที่อนุมัติ พร้อมคืนสมาชิกและแพ็กเกจเป็น ACTIVE */
export async function unfreezeMembership(
  actor: ActorContext,
  branchId: number,
  memberId: number,
) {
  return runAuditedMutation<number>(
    {
      actorStaffId: actor.staffId,
      branchId,
      action: "MEMBERSHIP_UNFROZEN",
      entityType: "FREEZE_RECORD",
      metadata: { memberId },
      success: (id) => ({ entityId: id }),
    },
    async (tx) => {
      const [record] = await tx.select().from(freezeRecords).where(and(eq(freezeRecords.memberId, memberId), eq(freezeRecords.branchId, branchId), eq(freezeRecords.activeKey, "ACTIVE"))).limit(1).for("update");
      if (!record) throw new MembershipLifecycleError("FREEZE_NOT_ACTIVE");
      const [memberPackage] = await tx.select().from(memberPackages).where(eq(memberPackages.id, record.memberPackageId)).limit(1).for("update");
      if (!memberPackage) throw new MembershipLifecycleError("PACKAGE_NOT_FOUND");
      const nextExpiry = extendExpiryDate(memberPackage.expireDate, record.requestedDays);
      await Promise.all([
        tx.update(freezeRecords).set({ status: "COMPLETED", activeKey: null, endedAt: new Date(), endedByStaffId: actor.staffId }).where(eq(freezeRecords.id, record.id)),
        tx.update(memberPackages).set({ status: "ACTIVE", expireDate: new Date(`${nextExpiry}T00:00:00`), freezeDaysUsed: sql`${memberPackages.freezeDaysUsed} + ${record.requestedDays}` }).where(eq(memberPackages.id, record.memberPackageId)),
        tx.update(members).set({ status: "ACTIVE" }).where(and(eq(members.id, memberId), eq(members.homeBranchId, branchId))),
      ]);
      return record.id;
    },
  );
}

/** หมุน Dynamic QR โดย revoke token ที่ยัง active ภายใต้ member row lock แล้วคืน raw token เพียงครั้งเดียว */
export async function rotateMemberAccessToken(
  actor: ActorContext,
  branchId: number,
  memberId: number,
) {
  const created = createMemberAccessToken();
  return runAuditedMutation<{
    id: number;
    token: string;
    expiresAt: Date;
  }>(
    {
      actorStaffId: actor.staffId,
      branchId,
      action: "MEMBER_QR_ROTATED",
      entityType: "MEMBER_ACCESS_TOKEN",
      metadata: { memberId },
      success: (value) => ({ entityId: value.id }),
    },
    async (tx) => {
      const [member] = await tx.select({ id: members.id }).from(members).where(and(eq(members.id, memberId), eq(members.homeBranchId, branchId), ne(members.status, "CANCELLED"))).limit(1).for("update");
      if (!member) throw new MembershipLifecycleError("MEMBER_NOT_FOUND");
      await tx.update(memberAccessTokens).set({ revokedAt: new Date() }).where(and(eq(memberAccessTokens.memberId, memberId), isNull(memberAccessTokens.revokedAt)));
      const result = await tx.insert(memberAccessTokens).values({
        memberId,
        branchId,
        tokenHash: created.tokenHash,
        expiresAt: created.expiresAt,
        issuedByStaffId: actor.staffId,
      });
      return { id: result[0].insertId, token: created.token, expiresAt: created.expiresAt };
    },
  );
}

/** revoke Dynamic QR ทั้งหมดของสมาชิกทันทีโดยไม่ต้องมี raw token */
export async function revokeMemberAccessTokens(actor: ActorContext, branchId: number, memberId: number) {
  return runAuditedMutation(
    { actorStaffId: actor.staffId, branchId, action: "MEMBER_QR_REVOKED", entityType: "MEMBER_ACCESS_TOKEN", metadata: { memberId } },
    (tx) => tx.update(memberAccessTokens).set({ revokedAt: new Date() }).where(and(eq(memberAccessTokens.memberId, memberId), eq(memberAccessTokens.branchId, branchId), isNull(memberAccessTokens.revokedAt))),
  );
}

/** หมุน QR จาก Member Portal โดย audit เป็น system action และไม่สร้าง Staff actor ปลอม */
export async function rotateSelfMemberAccessToken(memberId: number, branchId: number) {
  const created = createMemberAccessToken();
  return db.transaction(async (tx) => {
    const [member] = await tx.select({ id: members.id }).from(members).where(and(eq(members.id, memberId), eq(members.homeBranchId, branchId), ne(members.status, "CANCELLED"))).limit(1).for("update");
    if (!member) throw new MembershipLifecycleError("MEMBER_NOT_FOUND");
    await tx.update(memberAccessTokens).set({ revokedAt: new Date() }).where(and(eq(memberAccessTokens.memberId, memberId), isNull(memberAccessTokens.revokedAt)));
    const result = await tx.insert(memberAccessTokens).values({ memberId, branchId, tokenHash: created.tokenHash, expiresAt: created.expiresAt, issuedByStaffId: null });
    await writeAudit(tx, { actorStaffId: null, branchId, action: "MEMBER_QR_SELF_ROTATED", entityType: "MEMBER_ACCESS_TOKEN", entityId: result[0].insertId, result: "SUCCESS", metadata: { memberId } });
    return { token: created.token, expiresAt: created.expiresAt };
  });
}
