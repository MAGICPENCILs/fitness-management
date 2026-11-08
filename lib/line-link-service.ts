import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { consentEvents, memberLineLinks, members } from "@/db/schema";
import { writeAudit, type DbTransaction } from "@/lib/audit-service";
import { hasPermission, type ActorContext } from "@/lib/rbac";
import { AuthorizationError } from "@/lib/staff-service";
import { createLineLinkChallenge, hashLineLinkToken, isLineLinkToken, isLineUserId, LineLinkError, lineLinkStatus } from "@/lib/line-link-policy";

/** กัน ID ผิดรูปแบบก่อน query โดยไม่แปลงค่าจนทำให้สมาชิกเป้าหมายเปลี่ยน */
function assertMemberId(memberId: number) {
  if (!Number.isSafeInteger(memberId) || memberId <= 0) throw new LineLinkError("รหัสสมาชิกไม่ถูกต้อง", 400);
}

/** ตรวจ resource branch ที่โหลดจาก DB ซ้ำภายใต้ lock แทนเชื่อ branch จาก client */
function assertMemberAccess(actor: ActorContext, member: { homeBranchId: number } | undefined) {
  if (!member) throw new LineLinkError("ไม่พบสมาชิก", 404);
  if (!hasPermission(actor, "members.manage", member.homeBranchId)) throw new AuthorizationError("ไม่มีสิทธิ์จัดการสมาชิกของสาขานี้", 403);
}

/** ใช้ current locking read หลัง member→link lock เพื่อไม่อ่าน consent snapshot ก่อน privacy mutation */
async function hasServiceConsent(tx: DbTransaction, memberId: number) {
  const [latest] = await tx.select({ action: consentEvents.action }).from(consentEvents)
    .where(and(eq(consentEvents.memberId, memberId), eq(consentEvents.consentType, "SERVICE_PRIVACY")))
    .orderBy(desc(consentEvents.createdAt), desc(consentEvents.id)).limit(1).for("update");
  return latest?.action === "GRANTED";
}

/** คืนเฉพาะ DTO สถานะโดยไม่คืน command ซ้ำหรือขยาย whole-row member DTO */
export async function getLineLinkStatus(actor: ActorContext, memberId: number) {
  assertMemberId(memberId);
  const [member] = await db.select({ homeBranchId: members.homeBranchId }).from(members).where(eq(members.id, memberId)).limit(1);
  assertMemberAccess(actor, member);
  const [row] = await db.select().from(memberLineLinks).where(eq(memberLineLinks.memberId, memberId)).limit(1);
  return lineLinkStatus(row);
}

/** ออก/หมุน challenge และ audit ใน transaction เดียว; LINKED ต้อง unlink ก่อนเสมอ */
export async function issueLineLinkChallenge(actor: ActorContext, memberId: number) {
  assertMemberId(memberId);
  return db.transaction(async tx => {
    const [member] = await tx.select({ homeBranchId: members.homeBranchId, status: members.status }).from(members).where(eq(members.id, memberId)).limit(1).for("update");
    assertMemberAccess(actor, member);
    const [row] = await tx.select().from(memberLineLinks).where(eq(memberLineLinks.memberId, memberId)).limit(1).for("update");
    if (row?.lineUserId) throw new LineLinkError("สมาชิกเชื่อมต่อ LINE แล้ว กรุณายกเลิกก่อน", 409);
    if (member.status === "CANCELLED" || !(await hasServiceConsent(tx, memberId))) throw new LineLinkError("สมาชิกยังไม่พร้อมเชื่อมต่อ LINE", 409);
    const challenge = createLineLinkChallenge();
    const values = { lineUserId: null, linkedAt: null, challengeHash: challenge.challengeHash, challengeExpiresAt: challenge.challengeExpiresAt, initiatedByStaffId: actor.staffId, branchId: member.homeBranchId, updatedAt: new Date() };
    if (row) await tx.update(memberLineLinks).set(values).where(eq(memberLineLinks.memberId, memberId));
    else await tx.insert(memberLineLinks).values({ memberId, ...values });
    await writeAudit(tx, { actorStaffId: actor.staffId, branchId: member.homeBranchId, action: "LINE_LINK_CHALLENGE_ISSUED", entityType: "MEMBER", entityId: memberId, result: "SUCCESS", metadata: { memberId, branchId: member.homeBranchId, status: "PENDING" } });
    return { ...lineLinkStatus(values), command: `LINK ${challenge.token}` };
  });
}

/** ลบเฉพาะ pending/link ที่ยังมีผลและ audit ภายใต้ member→link lock; absent/expired เป็น no-op */
export async function removeLineLink(actor: ActorContext, memberId: number) {
  assertMemberId(memberId);
  return db.transaction(async tx => {
    const [member] = await tx.select({ homeBranchId: members.homeBranchId }).from(members).where(eq(members.id, memberId)).limit(1).for("update");
    assertMemberAccess(actor, member);
    const [row] = await tx.select().from(memberLineLinks).where(eq(memberLineLinks.memberId, memberId)).limit(1).for("update");
    if (lineLinkStatus(row).status !== "UNLINKED") {
      await tx.delete(memberLineLinks).where(eq(memberLineLinks.memberId, memberId));
      await writeAudit(tx, { actorStaffId: actor.staffId, branchId: member.homeBranchId, action: "LINE_LINK_REMOVED", entityType: "MEMBER", entityId: memberId, result: "SUCCESS", metadata: { memberId, branchId: member.homeBranchId, status: "UNLINKED" } });
    }
    return lineLinkStatus(undefined);
  });
}

/** แยก unique conflict เฉพาะจุดเขียน identifier; audit/DB failure อื่นต้องให้ provider retry */
function isDuplicateEntry(error: unknown) {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "ER_DUP_ENTRY") return true;
  return "cause" in error && !!error.cause && typeof error.cause === "object" && "code" in error.cause && error.cause.code === "ER_DUP_ENTRY";
}

/** ใช้ hash lookup เพื่อหา candidate เท่านั้น แล้ว lock member→link และตรวจสถานะ/consent ใหม่ก่อน consume+system audit */
export async function completeLineLinkChallenge(token: string, lineUserId: string): Promise<boolean> {
  if (!isLineLinkToken(token) || !isLineUserId(lineUserId)) return false;
  const hash = hashLineLinkToken(token);
  const [candidate] = await db.select({ memberId: memberLineLinks.memberId }).from(memberLineLinks).where(eq(memberLineLinks.challengeHash, hash)).limit(1);
  if (!candidate) return false;
  return db.transaction(async tx => {
    const [member] = await tx.select({ homeBranchId: members.homeBranchId, status: members.status }).from(members).where(eq(members.id, candidate.memberId)).limit(1).for("update");
    if (!member || member.status === "CANCELLED") return false;
    const [row] = await tx.select().from(memberLineLinks).where(eq(memberLineLinks.memberId, candidate.memberId)).limit(1).for("update");
    // ตรวจอายุหลัง await สุดท้ายด้วย เพื่อไม่ consume token ที่หมดอายุระหว่างรอ consent read
    if (!row || row.branchId !== member.homeBranchId || row.challengeHash !== hash || !(await hasServiceConsent(tx, candidate.memberId)) || lineLinkStatus(row).status !== "PENDING") return false;
    const now = new Date();
    try {
      await tx.update(memberLineLinks).set({ lineUserId, linkedAt: now, challengeHash: null, challengeExpiresAt: null, updatedAt: now }).where(eq(memberLineLinks.memberId, candidate.memberId));
    } catch (error) { if (isDuplicateEntry(error)) return false; throw error; }
    await writeAudit(tx, { actorStaffId: null, branchId: member.homeBranchId, action: "LINE_LINK_COMPLETED", entityType: "MEMBER", entityId: candidate.memberId, result: "SUCCESS", metadata: { memberId: candidate.memberId, branchId: member.homeBranchId, status: "LINKED", source: "LINE_WEBHOOK" } });
    return true;
  });
}
