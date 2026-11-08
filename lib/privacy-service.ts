import "server-only";

import { randomBytes } from "crypto";
import { mkdir, rename, stat, unlink } from "fs/promises";
import path from "path";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accessLogs,
  cardPool,
  consentEvents,
  crmInteractions,
  lockerRentals,
  loyaltyPoints,
  memberCrmProfiles,
  members,
  notifications,
  payments,
  receipts,
  freezeRecords,
  memberAccessTokens,
  memberAccounts,
  memberSessions,
  memberApplications,
  privacyFileCleanups,
  privacyRequests,
  ptPackages,
  ptSessions,
} from "@/db/schema";
import {
  runAuditedMutation,
  writeAudit,
  type DbTransaction,
} from "@/lib/audit-service";
import {
  getLatestConsent,
  type ConsentAction,
  type ConsentType,
} from "@/lib/consent-policy";
import { hasPermission, type ActorContext } from "@/lib/rbac";
import { AuthorizationError } from "@/lib/staff-service";
import {
  assertSeparateReviewer,
  buildAnonymizationValues,
  canRetryPrivacyCleanup,
  canTransitionRequest,
  type PrivacyRequestStatus,
} from "@/lib/privacy-policy";
import {
  executeAnonymizationPlan,
  type AnonymizationOperation,
} from "@/lib/privacy-anonymization";
import { memberPhotoAliases, resolveMemberPhotoPaths } from "@/lib/member-photo-path";

export class PrivacyOperationError extends Error {
  /** สร้างข้อผิดพลาดทางธุรกิจของ PDPA พร้อมสถานะ HTTP */
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "PrivacyOperationError";
  }
}

/** แยก source I/O ที่ต้องเก็บ retry metadata ออกจากไฟล์ร่วม/ซ้ำซึ่งห้ามแก้ cleanup ledger */
class MemberPhotoSourceError extends PrivacyOperationError {
  constructor() {
    super("ไม่สามารถตรวจสอบไฟล์รูปสมาชิกได้", 409);
  }
}

export type AppendConsentInput = {
  memberId: number;
  consentType: ConsentType;
  action: ConsentAction;
  policyVersion: string;
  note?: string;
};

export type PrivacyRequestFilters = {
  status?: PrivacyRequestStatus;
  branchId?: number;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
};

/** เลือก source เดียวภายใต้ member lock; source I/O เก็บชนิด error ไว้ให้ anonymization ติดตาม retry โดยไม่แก้ consent/member */
async function resolveMemberPhotoPath(photoUrl: string, memberId: number, tx: DbTransaction) {
  const candidates = resolveMemberPhotoPaths(photoUrl);
  if (!candidates) throw new PrivacyOperationError("ตำแหน่งไฟล์รูปสมาชิกไม่ถูกต้อง", 409);
  const [reference] = await tx.select({ id: members.id }).from(members)
    .where(and(ne(members.id, memberId), inArray(members.photoUrl, memberPhotoAliases(photoUrl)))).limit(1);
  if (reference) throw new PrivacyOperationError("รูปสมาชิกถูกใช้งานร่วม ต้องตรวจสอบก่อนลบ", 409);
  let sourcePath: string | undefined;
  for (const candidate of candidates) {
    try {
      const file = await stat(candidate);
      if (!file.isFile()) throw new MemberPhotoSourceError();
      if (sourcePath) throw new PrivacyOperationError("ตำแหน่งไฟล์รูปสมาชิกไม่ชัดเจน", 409);
      sourcePath = candidate;
    } catch (error) {
      if (error instanceof PrivacyOperationError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new MemberPhotoSourceError();
    }
  }
  if (!sourcePath) throw new MemberPhotoSourceError();
  return sourcePath;
}

/** คืนไฟล์เฉพาะเมื่อ primary DB ภายใต้ member lock ยืนยันว่า mutation rollback จริง ไม่คืนรูปหลังถอน consent สำเร็จ */
async function restoreMemberPhoto(memberId: number, photoUrl: string, originalPath: string, quarantinePath: string) {
  await db.transaction(async (tx) => {
    const [current] = await tx.select({ photoUrl: members.photoUrl, status: members.status }).from(members)
      .where(eq(members.id, memberId)).limit(1).for("update");
    if (current?.photoUrl === photoUrl && current.status !== "CANCELLED")
      await rename(quarantinePath, originalPath);
  });
}

/** โหลด consent snapshot และ event history ของสมาชิกโดยไม่แก้ไข ledger เดิม */
export async function getMemberConsentSnapshot(
  memberId: number,
  actor?: ActorContext,
  executor?: DbTransaction,
) {
  const database = executor ?? db;
  if (actor) {
    const [member] = await database
      .select({ homeBranchId: members.homeBranchId })
      .from(members)
      .where(eq(members.id, memberId))
      .limit(1);
    if (!member) throw new PrivacyOperationError("ไม่พบสมาชิก", 404);
    if (
      !hasPermission(actor, "privacy.consent.manage", member.homeBranchId)
    ) {
      await writeAudit(db, {
        actorStaffId: actor.staffId,
        branchId: actor.homeBranchId,
        action: "CONSENT_READ",
        entityType: "CONSENT",
        entityId: memberId,
        result: "DENIED",
        metadata: { branchId: member.homeBranchId },
      });
      throw new AuthorizationError("ไม่มีสิทธิ์ดู consent ของสาขานี้", 403);
    }
  }
  const rows = await database
    .select()
    .from(consentEvents)
    .where(eq(consentEvents.memberId, memberId))
    .orderBy(asc(consentEvents.createdAt), asc(consentEvents.id));
  const policyRows = rows
    .filter((row): row is typeof row & { createdAt: Date } => row.createdAt !== null)
    .map((row) => ({
      id: row.id,
      consentType: row.consentType,
      action: row.action,
      createdAt: row.createdAt,
    }));
  return {
    current: getLatestConsent(policyRows),
    events: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt?.toISOString() ?? null,
    })),
  };
}

/** เพิ่ม consent แบบ append-only โดยเลือกและย้ายรูปภายใต้ member lock เดียวกับ upload ก่อนเปลี่ยน ledger/Audit */
export async function appendConsentEvent(
  input: AppendConsentInput,
  actor: ActorContext,
) {
  const [member] = await db
    .select({
      id: members.id,
      homeBranchId: members.homeBranchId,
    })
    .from(members)
    .where(eq(members.id, input.memberId))
    .limit(1);
  if (!member) throw new PrivacyOperationError("ไม่พบสมาชิก", 404);
  if (!hasPermission(actor, "privacy.consent.manage", member.homeBranchId)) {
    await writeAudit(db, {
      actorStaffId: actor.staffId,
      branchId: actor.homeBranchId,
      action: `CONSENT_${input.action}`,
      entityType: "CONSENT",
      entityId: input.memberId,
      result: "DENIED",
      metadata: { branchId: member.homeBranchId },
    });
    throw new AuthorizationError("ไม่มีสิทธิ์จัดการ consent ของสาขานี้", 403);
  }

  let originalPhotoPath: string | undefined;
  let quarantinePath: string | undefined;
  let quarantineToken: string | undefined;
  let originalPhotoUrl: string | undefined;
  let photoMoved = false;

  try {
    return await runAuditedMutation<number>(
      {
        actorStaffId: actor.staffId,
        branchId: member.homeBranchId,
        action: `CONSENT_${input.action}`,
        entityType: "CONSENT",
        metadata: {
          memberId: input.memberId,
          module: input.consentType,
          status: input.action,
        },
        success: (entityId) => ({ entityId }),
      },
      async (tx) => {
        const [lockedMember] = await tx.select({ homeBranchId: members.homeBranchId, photoUrl: members.photoUrl, status: members.status })
          .from(members).where(eq(members.id, input.memberId)).limit(1).for("update");
        if (!lockedMember || lockedMember.homeBranchId !== member.homeBranchId || lockedMember.status === "CANCELLED")
          throw new PrivacyOperationError("สถานะสมาชิกเปลี่ยนไป กรุณาโหลดใหม่", 409);
        if (input.consentType === "PHOTO" && input.action === "WITHDRAWN" && lockedMember.photoUrl) {
          originalPhotoUrl = lockedMember.photoUrl;
          originalPhotoPath = await resolveMemberPhotoPath(originalPhotoUrl, input.memberId, tx);
          quarantineToken = randomBytes(32).toString("hex");
          quarantinePath = getQuarantinePath(quarantineToken);
          await mkdir(path.dirname(quarantinePath), { recursive: true });
          try {
            await rename(originalPhotoPath, quarantinePath);
            photoMoved = true;
          } catch {
            throw new PrivacyOperationError("ไม่สามารถย้ายรูปไปพื้นที่พักไฟล์ได้ จึงยังไม่ถอน consent", 409);
          }
        }
        const result = await tx.insert(consentEvents).values({
          memberId: input.memberId,
          branchId: member.homeBranchId,
          recordedByStaffId: actor.staffId,
          consentType: input.consentType,
          action: input.action,
          policyVersion: input.policyVersion,
          source: "FRONT_DESK",
          note: input.note || null,
        });

        if (input.consentType === "PHOTO" && input.action === "WITHDRAWN") {
          await tx
            .update(members)
            .set({ photoUrl: null })
            .where(eq(members.id, input.memberId));
          if (quarantineToken)
            await tx.insert(privacyFileCleanups).values({
              memberId: input.memberId,
              source: "PHOTO_CONSENT_WITHDRAWAL",
              quarantineToken,
              status: "PENDING",
            });
        }
        if (
          input.consentType === "SERVICE_PRIVACY" &&
          input.action === "WITHDRAWN"
        )
          await tx
            .update(members)
            .set({ status: "SUSPENDED" })
            .where(
              and(
                eq(members.id, input.memberId),
                ne(members.status, "CANCELLED"),
              ),
            );
        if (
          input.consentType === "SERVICE_PRIVACY" &&
          input.action === "GRANTED"
        )
          await tx
            .update(members)
            .set({ status: "ACTIVE" })
            .where(
              and(
                eq(members.id, input.memberId),
                eq(members.status, "SUSPENDED"),
              ),
            );
        return result[0].insertId;
      },
    );
  } catch (error) {
    if (photoMoved && originalPhotoUrl && originalPhotoPath && quarantinePath) {
      try {
        await restoreMemberPhoto(input.memberId, originalPhotoUrl, originalPhotoPath, quarantinePath);
      } catch {
        console.error("MEMBER_PHOTO_RESTORE_FAILED");
      }
    }
    throw error;
  }
}

/** โหลดคำขอแบบแบ่งหน้า โดยบังคับ non-owner ให้อยู่เฉพาะสาขาหลักของตน */
export async function getPrivacyRequests(
  actor: ActorContext,
  filters: PrivacyRequestFilters,
) {
  const branchId =
    actor.role === "OWNER" ? filters.branchId : actor.homeBranchId;
  const conditions = [
    filters.status ? eq(privacyRequests.status, filters.status) : undefined,
    branchId ? eq(privacyRequests.branchId, branchId) : undefined,
    filters.from
      ? gte(privacyRequests.requestedAt, filters.from)
      : undefined,
    filters.to ? lte(privacyRequests.requestedAt, filters.to) : undefined,
  ].filter((condition) => condition !== undefined);
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: privacyRequests.id,
        memberId: privacyRequests.memberId,
        memberCode: members.memberCode,
        memberFirstName: members.firstName,
        memberLastName: members.lastName,
        branchId: privacyRequests.branchId,
        requestType: privacyRequests.requestType,
        status: privacyRequests.status,
        reason: privacyRequests.reason,
        requestedByStaffId: privacyRequests.requestedByStaffId,
        requestedAt: privacyRequests.requestedAt,
        reviewedByStaffId: privacyRequests.reviewedByStaffId,
        reviewedAt: privacyRequests.reviewedAt,
        reviewNote: privacyRequests.reviewNote,
        completedAt: privacyRequests.completedAt,
        fileCleanupStatus: privacyRequests.fileCleanupStatus,
        fileCleanupError: privacyRequests.fileCleanupError,
      })
      .from(privacyRequests)
      .innerJoin(members, eq(privacyRequests.memberId, members.id))
      .where(where)
      .orderBy(desc(privacyRequests.requestedAt), desc(privacyRequests.id))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db
      .select({ count: sql<number>`count(*)` })
      .from(privacyRequests)
      .where(where),
  ]);
  return {
    rows: rows.map((row) => ({
      ...row,
      requestedAt: row.requestedAt?.toISOString() ?? null,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
    })),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      total: Number(countRow?.count ?? 0),
    },
  };
}

/** สร้างคำขอ anonymization เมื่อสมาชิกยังไม่ถูกล้างและไม่มีคำขอเปิดซ้ำ */
export async function createPrivacyRequest(
  input: { memberId: number; reason: string },
  actor: ActorContext,
) {
  const [member] = await db
    .select({
      id: members.id,
      homeBranchId: members.homeBranchId,
      status: members.status,
    })
    .from(members)
    .where(eq(members.id, input.memberId))
    .limit(1);
  if (!member) throw new PrivacyOperationError("ไม่พบสมาชิก", 404);
  if (!hasPermission(actor, "privacy.request.create", member.homeBranchId)) {
    await writeAudit(db, {
      actorStaffId: actor.staffId,
      branchId: actor.homeBranchId,
      action: "PRIVACY_REQUEST_CREATED",
      entityType: "PRIVACY_REQUEST",
      entityId: input.memberId,
      result: "DENIED",
      metadata: { branchId: member.homeBranchId },
    });
    throw new AuthorizationError("ไม่มีสิทธิ์สร้างคำขอของสาขานี้", 403);
  }
  if (member.status === "CANCELLED")
    throw new PrivacyOperationError("สมาชิกนี้ถูกทำข้อมูลนิรนามแล้ว", 409);

  try {
    return await runAuditedMutation<number>(
      {
        actorStaffId: actor.staffId,
        branchId: member.homeBranchId,
        action: "PRIVACY_REQUEST_CREATED",
        entityType: "PRIVACY_REQUEST",
        metadata: { memberId: input.memberId, status: "PENDING" },
        success: (entityId) => ({ entityId }),
      },
      async (tx) => {
        const [openRequest] = await tx
          .select({ id: privacyRequests.id })
          .from(privacyRequests)
          .where(
            and(
              eq(privacyRequests.memberId, input.memberId),
              eq(privacyRequests.openRequestKey, "ANONYMIZATION"),
            ),
          )
          .limit(1)
          .for("update");
        if (openRequest)
          throw new PrivacyOperationError(
            "สมาชิกนี้มีคำขอ anonymization ที่ยังไม่ปิด",
            409,
          );
        const result = await tx.insert(privacyRequests).values({
          memberId: input.memberId,
          branchId: member.homeBranchId,
          requestType: "ANONYMIZATION",
          status: "PENDING",
          openRequestKey: "ANONYMIZATION",
          reason: input.reason,
          requestedByStaffId: actor.staffId,
          fileCleanupStatus: "NOT_REQUIRED",
        });
        return result[0].insertId;
      },
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "errno" in error &&
      error.errno === 1062
    )
      throw new PrivacyOperationError(
        "สมาชิกนี้มีคำขอ anonymization ที่ยังไม่ปิด",
        409,
      );
    throw error;
  }
}

/** อนุมัติหรือปฏิเสธคำขอหลังตรวจสิทธิ์ สาขา state และ separation of duties */
export async function reviewPrivacyRequest(
  requestId: number,
  input: { status: "APPROVED" | "REJECTED"; reviewNote?: string },
  actor: ActorContext,
) {
  const [request] = await db
    .select({
      id: privacyRequests.id,
      branchId: privacyRequests.branchId,
      requestedByStaffId: privacyRequests.requestedByStaffId,
      status: privacyRequests.status,
    })
    .from(privacyRequests)
    .where(eq(privacyRequests.id, requestId))
    .limit(1);
  if (!request) throw new PrivacyOperationError("ไม่พบคำขอ", 404);
  if (!hasPermission(actor, "privacy.request.approve", request.branchId)) {
    await writeAudit(db, {
      actorStaffId: actor.staffId,
      branchId: actor.homeBranchId,
      action: `PRIVACY_REQUEST_${input.status}`,
      entityType: "PRIVACY_REQUEST",
      entityId: requestId,
      result: "DENIED",
      metadata: { branchId: request.branchId },
    });
    throw new AuthorizationError("ไม่มีสิทธิ์พิจารณาคำขอของสาขานี้", 403);
  }
  try {
    assertSeparateReviewer(request.requestedByStaffId, actor.staffId);
  } catch {
    throw new PrivacyOperationError(
      "ผู้สร้างและผู้พิจารณาต้องเป็นคนละคน",
      409,
    );
  }
  if (!canTransitionRequest(request.status, input.status))
    throw new PrivacyOperationError("สถานะคำขอไม่รองรับการพิจารณานี้", 409);

  await runAuditedMutation(
    {
      actorStaffId: actor.staffId,
      branchId: request.branchId,
      action: `PRIVACY_REQUEST_${input.status}`,
      entityType: "PRIVACY_REQUEST",
      entityId: requestId,
      metadata: { status: input.status },
    },
    async (tx) => {
      const [locked] = await tx
        .select({
          status: privacyRequests.status,
          requestedByStaffId: privacyRequests.requestedByStaffId,
        })
        .from(privacyRequests)
        .where(eq(privacyRequests.id, requestId))
        .limit(1)
        .for("update");
      if (!locked || !canTransitionRequest(locked.status, input.status))
        throw new PrivacyOperationError(
          "สถานะคำขอถูกเปลี่ยนโดยผู้ใช้อื่น กรุณาโหลดใหม่",
          409,
        );
      try {
        assertSeparateReviewer(locked.requestedByStaffId, actor.staffId);
      } catch {
        throw new PrivacyOperationError(
          "ผู้สร้างและผู้พิจารณาต้องเป็นคนละคน",
          409,
        );
      }
      await tx
        .update(privacyRequests)
        .set({
          status: input.status,
          reviewedByStaffId: actor.staffId,
          reviewedAt: new Date(),
          reviewNote: input.reviewNote || null,
          openRequestKey:
            input.status === "REJECTED" ? null : "ANONYMIZATION",
          fileCleanupStatus:
            input.status === "APPROVED" ? "PENDING" : "NOT_REQUIRED",
          fileCleanupError: null,
        })
        .where(eq(privacyRequests.id, requestId));
    },
  );
}

type AnonymizationContext = {
  requestId: number;
  memberId: number;
  branchId: number;
  actor: ActorContext;
  memberToken: string;
  quarantineToken?: string;
};

/** พักไฟล์ใหม่ใน private storage เท่านั้น โดย token ต้องผ่าน allowlist ก่อนประกอบ path */
function getQuarantinePath(token: string) {
  if (!/^[A-F0-9]{64}$/i.test(token))
    throw new PrivacyOperationError("quarantine token ไม่ถูกต้อง", 409);
  return path.resolve(
    process.cwd(),
    "storage",
    "privacy-cleanup",
    token,
  );
}

/** ลบ token ทั้ง private/legacy จนครบ; เฉพาะ ENOENT เท่านั้นที่นับว่าสำเร็จเพื่อให้ retry partial failure ได้ */
async function removeQuarantinedFile(token: string) {
  const privatePath = getQuarantinePath(token);
  const legacyPath = path.join(process.cwd(), "public", "uploads", "privacy-cleanup", token);
  for (const candidate of [privatePath, legacyPath]) {
    try {
      await unlink(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

/** แปลงแผน anonymization เป็น Drizzle mutations ใน transaction เดียว โดยไม่แตะยอดเงิน วิธีชำระ ใบเสร็จ หรือวันที่แพ็กเกจ */
async function executeAnonymizationOperation(
  tx: DbTransaction,
  operation: AnonymizationOperation,
  context: AnonymizationContext,
  onCleanupCreated: (cleanupId: number) => void,
) {
  const { requestId, memberId, branchId, actor } = context;
  switch (operation.table) {
    case "members":
      await tx
        .update(members)
        .set(buildAnonymizationValues(memberId, context.memberToken))
        .where(eq(members.id, memberId));
      return;
    case "card_pool":
      await tx
        .update(cardPool)
        .set({ memberId: null, status: "AVAILABLE", assignedAt: null })
        .where(eq(cardPool.memberId, memberId));
      return;
    case "access_logs":
      await tx
        .update(accessLogs)
        .set({
          serial: sql`concat('ANON-', ${accessLogs.id})`,
          reason: "ANONYMIZED",
        })
        .where(eq(accessLogs.memberId, memberId));
      return;
    case "member_crm_profiles":
      await tx
        .update(memberCrmProfiles)
        .set({ interests: null, fitnessGoals: null, preferredContact: "NONE" })
        .where(eq(memberCrmProfiles.memberId, memberId));
      return;
    case "crm_interactions":
      await tx
        .update(crmInteractions)
        .set({ summary: "ANONYMIZED" })
        .where(eq(crmInteractions.memberId, memberId));
      return;
    case "notifications":
      await tx
        .update(notifications)
        .set({
          recipient: null,
          title: "ANONYMIZED",
          message: "ANONYMIZED",
          errorMessage: null,
        })
        .where(eq(notifications.memberId, memberId));
      return;
    case "loyalty_points":
      await tx
        .update(loyaltyPoints)
        .set({ source: "PRIVACY_ANONYMIZATION", note: "ANONYMIZED" })
        .where(eq(loyaltyPoints.memberId, memberId));
      return;
    case "pt_packages":
      await tx
        .update(ptPackages)
        .set({ note: null })
        .where(eq(ptPackages.memberId, memberId));
      return;
    case "pt_sessions":
      await tx
        .update(ptSessions)
        .set({
          weightKg: null,
          bmi: null,
          waistCm: null,
          workoutSummary: null,
          trainerNote: null,
        })
        .where(
          inArray(
            ptSessions.packageId,
            tx
              .select({ id: ptPackages.id })
              .from(ptPackages)
              .where(eq(ptPackages.memberId, memberId)),
          ),
        );
      return;
    case "payments":
      await tx
        .update(payments)
        .set({ note: null })
        .where(eq(payments.memberId, memberId));
      return;
    case "receipts":
      // คงยอด ภาษี เลขเอกสาร และข้อมูลผู้ขายไว้ตามข้อกำหนดบัญชี แต่ล้างตัวระบุผู้ซื้อทั้งหมด
      await tx
        .update(receipts)
        .set({
          buyerName: "ANONYMIZED",
          buyerTaxId: null,
          buyerAddress: null,
        })
        .where(
          inArray(
            receipts.paymentId,
            tx
              .select({ id: payments.id })
              .from(payments)
              .where(eq(payments.memberId, memberId)),
          ),
        );
      return;
    case "freeze_records":
      await tx
        .update(freezeRecords)
        .set({ reason: "ANONYMIZED" })
        .where(eq(freezeRecords.memberId, memberId));
      return;
    case "member_access_tokens":
      await tx
        .update(memberAccessTokens)
        .set({ revokedAt: new Date() })
        .where(eq(memberAccessTokens.memberId, memberId));
      return;
    case "member_accounts":
      await tx.update(memberAccounts).set({ email: sql`concat('anon-', ${memberAccounts.memberId}, '@invalid.local')`, passwordHash: "ANONYMIZED", status: "INACTIVE" }).where(eq(memberAccounts.memberId, memberId));
      return;
    case "member_sessions":
      await tx.update(memberSessions).set({ revokedAt: new Date() }).where(inArray(memberSessions.memberAccountId, tx.select({ id: memberAccounts.id }).from(memberAccounts).where(eq(memberAccounts.memberId, memberId))));
      return;
    case "member_applications":
      await tx.update(memberApplications).set({ firstName: "ANONYMIZED", lastName: "ANONYMIZED", phone: "", email: sql`concat('anon-app-', ${memberApplications.id}, '@invalid.local')`, passwordHash: "ANONYMIZED", reviewNote: null }).where(eq(memberApplications.memberId, memberId));
      return;
    case "locker_rentals":
      await tx
        .update(lockerRentals)
        .set({ note: null })
        .where(eq(lockerRentals.memberId, memberId));
      return;
    case "consent_events":
      await tx.insert(consentEvents).values(
        (["SERVICE_PRIVACY", "MARKETING", "PHOTO"] as const).map(
          (consentType) => ({
            memberId,
            branchId,
            recordedByStaffId: actor.staffId,
            consentType,
            action: "WITHDRAWN" as const,
            policyVersion: "ANONYMIZATION-1",
            source: "PRIVACY_REQUEST" as const,
            note: null,
          }),
        ),
      );
      return;
    case "privacy_requests":
      await tx
        .update(privacyRequests)
        .set({
          status: context.quarantineToken ? "APPROVED" : "COMPLETED",
          openRequestKey: context.quarantineToken ? "ANONYMIZATION" : null,
          completedAt: context.quarantineToken ? null : new Date(),
          fileCleanupStatus: context.quarantineToken
            ? "PENDING"
            : "NOT_REQUIRED",
          fileCleanupError: null,
        })
        .where(eq(privacyRequests.id, requestId));
      return;
    case "privacy_file_cleanups":
      if (context.quarantineToken) {
        const result = await tx.insert(privacyFileCleanups).values({
          memberId,
          privacyRequestId: requestId,
          source: "ANONYMIZATION",
          quarantineToken: context.quarantineToken,
          status: "PENDING",
        });
        onCleanupCreated(result[0].insertId);
      }
      return;
    case "audit_logs":
      await writeAudit(tx, {
        actorStaffId: actor.staffId,
        branchId,
        action: "PRIVACY_ANONYMIZED",
        entityType: "PRIVACY_REQUEST",
        entityId: requestId,
        result: "SUCCESS",
        metadata: { memberId, status: "ANONYMIZED" },
      });
  }
}

/** ปิดคำขอและ cleanup พร้อมกัน เพื่อไม่ให้ UI แสดงว่าสำเร็จก่อนไฟล์ถูกลบจริง */
async function completePrivacyCleanup(
  requestId: number,
  cleanupId?: number,
  retryAudit?: { actor: ActorContext; branchId: number },
) {
  await db.transaction(async (tx) => {
    if (cleanupId)
      await tx
        .update(privacyFileCleanups)
        .set({ status: "COMPLETED", errorCode: null, completedAt: new Date() })
        .where(eq(privacyFileCleanups.id, cleanupId));
    await tx
      .update(privacyRequests)
      .set({
        status: "COMPLETED",
        openRequestKey: null,
        completedAt: new Date(),
        fileCleanupStatus: cleanupId ? "COMPLETED" : "NOT_REQUIRED",
        fileCleanupError: null,
      })
      .where(
        and(
          eq(privacyRequests.id, requestId),
          eq(privacyRequests.status, "APPROVED"),
        ),
      );
    if (retryAudit)
      await writeAudit(tx, {
        actorStaffId: retryAudit.actor.staffId,
        branchId: retryAudit.branchId,
        action: "PRIVACY_CLEANUP_RETRIED",
        entityType: "PRIVACY_REQUEST",
        entityId: requestId,
        result: "SUCCESS",
        metadata: { status: "COMPLETED" },
      });
  });
}

/** บันทึกรหัสข้อผิดพลาดที่ไม่มี PII และคงสถานะ APPROVED ไว้เพื่อให้เจ้าหน้าที่ retry */
async function failPrivacyCleanup(
  requestId: number,
  cleanupId: number | undefined,
  errorCode: "FILE_MOVE_FAILED" | "FILE_DELETE_FAILED" | "FILE_RESTORE_FAILED",
) {
  await db.transaction(async (tx) => {
    if (cleanupId)
      await tx
        .update(privacyFileCleanups)
        .set({ status: "FAILED", errorCode })
        .where(eq(privacyFileCleanups.id, cleanupId));
    await tx
      .update(privacyRequests)
      .set({ fileCleanupStatus: "FAILED", fileCleanupError: errorCode })
      .where(eq(privacyRequests.id, requestId));
  });
}

/** บันทึก failed audit โดยไม่บังข้อผิดพลาดหลักหรือส่ง raw error ที่อาจมี SQL/PII เข้า logger */
async function writePrivacyFailureAudit(
  requestId: number,
  branchId: number,
  actor: ActorContext,
  action: "PRIVACY_ANONYMIZED" | "PRIVACY_CLEANUP_RETRIED",
  errorCode: string,
) {
  try {
    await writeAudit(db, {
      actorStaffId: actor.staffId,
      branchId,
      action,
      entityType: "PRIVACY_REQUEST",
      entityId: requestId,
      result: "FAILED",
      metadata: { errorCode },
    });
  } catch {
    console.error("PRIVACY_FAILURE_AUDIT_FAILED");
  }
}

/** ล้างข้อมูลเมื่ออนุมัติแล้ว โดยอ่านและย้ายรูปล่าสุดภายใต้ member lock เดียวกับ upload และคืนเฉพาะเมื่อ rollback จริง */
export async function anonymizeApprovedRequest(
  requestId: number,
  actor: ActorContext,
) {
  const [record] = await db
    .select({
      memberId: privacyRequests.memberId,
      branchId: privacyRequests.branchId,
      status: privacyRequests.status,
      requestedByStaffId: privacyRequests.requestedByStaffId,
      reviewedByStaffId: privacyRequests.reviewedByStaffId,
      memberStatus: members.status,
    })
    .from(privacyRequests)
    .innerJoin(members, eq(privacyRequests.memberId, members.id))
    .where(eq(privacyRequests.id, requestId))
    .limit(1);
  if (!record) throw new PrivacyOperationError("ไม่พบคำขอ", 404);
  if (!hasPermission(actor, "privacy.request.approve", record.branchId)) {
    await writeAudit(db, {
      actorStaffId: actor.staffId,
      branchId: actor.homeBranchId,
      action: "PRIVACY_ANONYMIZED",
      entityType: "PRIVACY_REQUEST",
      entityId: requestId,
      result: "DENIED",
      metadata: { branchId: record.branchId },
    });
    throw new AuthorizationError("ไม่มีสิทธิ์ทำข้อมูลนิรนามข้ามสาขา", 403);
  }
  if (record.status !== "APPROVED")
    throw new PrivacyOperationError("คำขอยังไม่ได้รับอนุมัติ", 409);
  if (record.reviewedByStaffId === null)
    throw new PrivacyOperationError("คำขอไม่มีผู้พิจารณา", 409);
  try {
    assertSeparateReviewer(record.requestedByStaffId, record.reviewedByStaffId);
  } catch {
    throw new PrivacyOperationError("ผู้สร้างและผู้พิจารณาต้องเป็นคนละคน", 409);
  }
  if (record.memberStatus === "CANCELLED")
    throw new PrivacyOperationError("ข้อมูลสมาชิกถูกทำให้นิรนามแล้ว", 409);

  const memberToken = randomBytes(6).toString("hex").toUpperCase();
  let quarantineToken: string | undefined;
  let originalPhotoUrl: string | undefined;
  let originalPhotoPath: string | undefined;
  let quarantinePath: string | undefined;
  let photoMoved = false;
  let fileMoveFailed = false;
  let cleanupId: number | undefined;
  try {
    await db.transaction(async (tx) => {
      const [lockedRequest] = await tx
        .select({
          memberId: privacyRequests.memberId,
          branchId: privacyRequests.branchId,
          status: privacyRequests.status,
          requestedByStaffId: privacyRequests.requestedByStaffId,
          reviewedByStaffId: privacyRequests.reviewedByStaffId,
        })
        .from(privacyRequests)
        .where(eq(privacyRequests.id, requestId))
        .limit(1)
        .for("update");
      const [lockedMember] = await tx
        .select({ status: members.status, photoUrl: members.photoUrl, homeBranchId: members.homeBranchId })
        .from(members)
        .where(eq(members.id, record.memberId))
        .limit(1)
        .for("update");
      if (
        !lockedRequest ||
        !lockedMember ||
        lockedRequest.memberId !== record.memberId ||
        lockedRequest.branchId !== record.branchId ||
        lockedRequest.status !== "APPROVED" ||
        lockedMember.homeBranchId !== record.branchId ||
        lockedMember.status === "CANCELLED" ||
        lockedRequest.reviewedByStaffId === null
      )
        throw new PrivacyOperationError(
          "สถานะคำขอหรือสมาชิกเปลี่ยนไป กรุณาโหลดใหม่",
          409,
        );
      assertSeparateReviewer(
        lockedRequest.requestedByStaffId,
        lockedRequest.reviewedByStaffId,
      );
      if (lockedMember.photoUrl) {
        originalPhotoUrl = lockedMember.photoUrl;
        quarantineToken = randomBytes(32).toString("hex");
        try {
          originalPhotoPath = await resolveMemberPhotoPath(originalPhotoUrl, record.memberId, tx);
        } catch (error) {
          fileMoveFailed = error instanceof MemberPhotoSourceError;
          throw error;
        }
        quarantinePath = getQuarantinePath(quarantineToken);
        await mkdir(path.dirname(quarantinePath), { recursive: true });
        try {
          await rename(originalPhotoPath, quarantinePath);
          photoMoved = true;
        } catch (error) {
          // EXDEV ต้องหยุดก่อนสร้าง cleanup ledger; ข้อผิดพลาดย้ายแบบเดิมยังคง retry tracking
          fileMoveFailed = (error as NodeJS.ErrnoException).code !== "EXDEV";
          throw new PrivacyOperationError("ย้ายรูปไปพื้นที่พักไฟล์ไม่สำเร็จ จึงยังไม่ล้างข้อมูลสมาชิก", 409);
        }
      }
      await executeAnonymizationPlan({
        async execute(operation) {
          await executeAnonymizationOperation(
            tx,
            operation,
            {
              requestId,
              memberId: record.memberId,
              branchId: record.branchId,
              actor,
              memberToken,
              quarantineToken,
            },
            (createdId) => {
              cleanupId = createdId;
            },
          );
        },
      });
    });
  } catch (error) {
    if (fileMoveFailed) {
      const result = await db.insert(privacyFileCleanups).values({
        memberId: record.memberId, privacyRequestId: requestId, source: "ANONYMIZATION",
        quarantineToken: quarantineToken!, status: "FAILED", errorCode: "FILE_MOVE_FAILED",
      });
      await failPrivacyCleanup(requestId, result[0].insertId, "FILE_MOVE_FAILED");
      await writePrivacyFailureAudit(requestId, record.branchId, actor, "PRIVACY_ANONYMIZED", "FILE_MOVE_FAILED");
      throw error;
    }
    if (photoMoved && originalPhotoUrl && originalPhotoPath && quarantinePath) {
      try {
        await restoreMemberPhoto(record.memberId, originalPhotoUrl, originalPhotoPath, quarantinePath);
      } catch {
        const result = await db.insert(privacyFileCleanups).values({
          memberId: record.memberId,
          privacyRequestId: requestId,
          source: "ANONYMIZATION",
          quarantineToken: quarantineToken!,
          status: "FAILED",
          errorCode: "FILE_RESTORE_FAILED",
        });
        await failPrivacyCleanup(
          requestId,
          result[0].insertId,
          "FILE_RESTORE_FAILED",
        );
      }
    }
    await writePrivacyFailureAudit(
      requestId,
      record.branchId,
      actor,
      "PRIVACY_ANONYMIZED",
      "ANONYMIZATION_TRANSACTION_FAILED",
    );
    throw error;
  }

  if (!cleanupId) {
    return;
  }
  const [cleanup] = await db
    .select({ quarantineToken: privacyFileCleanups.quarantineToken })
    .from(privacyFileCleanups)
    .where(eq(privacyFileCleanups.id, cleanupId))
    .limit(1);
  if (!cleanup)
    throw new PrivacyOperationError("ไม่พบรายการ cleanup", 409);
  try {
    await removeQuarantinedFile(cleanup.quarantineToken);
    await completePrivacyCleanup(requestId, cleanupId);
  } catch {
    await failPrivacyCleanup(requestId, cleanupId, "FILE_DELETE_FAILED");
    await writePrivacyFailureAudit(
      requestId,
      record.branchId,
      actor,
      "PRIVACY_ANONYMIZED",
      "FILE_DELETE_FAILED",
    );
    throw new PrivacyOperationError(
      "ล้างข้อมูลแล้ว แต่ลบไฟล์ใน quarantine ไม่สำเร็จ",
      409,
    );
  }
}

/** retry cleanup เฉพาะคำขอ APPROVED; ถ้าข้อมูลยังไม่ถูกล้างจะเริ่ม safe move และ transaction ใหม่ */
export async function retryPrivacyFileCleanup(
  requestId: number,
  actor: ActorContext,
) {
  const [record] = await db
    .select({
      branchId: privacyRequests.branchId,
      status: privacyRequests.status,
      fileCleanupStatus: privacyRequests.fileCleanupStatus,
      fileCleanupError: privacyRequests.fileCleanupError,
      memberStatus: members.status,
    })
    .from(privacyRequests)
    .innerJoin(members, eq(privacyRequests.memberId, members.id))
    .where(eq(privacyRequests.id, requestId))
    .limit(1);
  if (!record) throw new PrivacyOperationError("ไม่พบคำขอ", 404);
  if (!hasPermission(actor, "privacy.request.approve", record.branchId)) {
    await writeAudit(db, {
      actorStaffId: actor.staffId,
      branchId: actor.homeBranchId,
      action: "PRIVACY_CLEANUP_RETRIED",
      entityType: "PRIVACY_REQUEST",
      entityId: requestId,
      result: "DENIED",
      metadata: { branchId: record.branchId },
    });
    throw new AuthorizationError("ไม่มีสิทธิ์ retry cleanup ข้ามสาขา", 403);
  }
  if (record.fileCleanupError === "FILE_RESTORE_FAILED")
    throw new PrivacyOperationError(
      "คืนไฟล์จาก quarantine ไม่สำเร็จ ต้องตรวจสอบไฟล์ด้วยตนเอง",
      409,
    );
  if (
    !canRetryPrivacyCleanup(
      record.status,
      record.fileCleanupStatus,
      record.fileCleanupError,
    )
  )
    throw new PrivacyOperationError("สถานะคำขอไม่รองรับการ retry", 409);

  if (record.memberStatus !== "CANCELLED")
    return anonymizeApprovedRequest(requestId, actor);

  const [cleanup] = await db
    .select({
      id: privacyFileCleanups.id,
      quarantineToken: privacyFileCleanups.quarantineToken,
    })
    .from(privacyFileCleanups)
    .where(eq(privacyFileCleanups.privacyRequestId, requestId))
    .orderBy(desc(privacyFileCleanups.id))
    .limit(1);
  if (!cleanup) {
    await completePrivacyCleanup(requestId, undefined, {
      actor,
      branchId: record.branchId,
    });
    return;
  }
  try {
    await removeQuarantinedFile(cleanup.quarantineToken);
    await completePrivacyCleanup(requestId, cleanup.id, {
      actor,
      branchId: record.branchId,
    });
  } catch {
    await failPrivacyCleanup(requestId, cleanup.id, "FILE_DELETE_FAILED");
    await writePrivacyFailureAudit(
      requestId,
      record.branchId,
      actor,
      "PRIVACY_CLEANUP_RETRIED",
      "FILE_DELETE_FAILED",
    );
    throw new PrivacyOperationError("ลบไฟล์ quarantine ซ้ำไม่สำเร็จ", 409);
  }
}
