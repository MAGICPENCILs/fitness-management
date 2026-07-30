import "server-only";

import { randomBytes } from "crypto";
import { mkdir, rename } from "fs/promises";
import path from "path";
import { and, asc, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  consentEvents,
  members,
  privacyFileCleanups,
  privacyRequests,
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
  canTransitionRequest,
  type PrivacyRequestStatus,
} from "@/lib/privacy-policy";

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

/** แปลง photo URL ภายในระบบเป็น path ที่ยืนยันแล้วว่าอยู่ใต้ uploads/members เท่านั้น */
function resolveMemberPhotoPath(photoUrl: string) {
  if (!photoUrl.startsWith("/uploads/members/") || photoUrl.includes(".."))
    throw new PrivacyOperationError("ตำแหน่งไฟล์รูปสมาชิกไม่ถูกต้อง", 409);
  const uploadRoot = path.resolve(process.cwd(), "public", "uploads", "members");
  const sourcePath = path.resolve(process.cwd(), "public", photoUrl.slice(1));
  if (!sourcePath.startsWith(`${uploadRoot}${path.sep}`))
    throw new PrivacyOperationError("ตำแหน่งไฟล์รูปสมาชิกไม่ถูกต้อง", 409);
  return sourcePath;
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

/** เพิ่ม consent event แบบ append-only พร้อม side effect และ audit ใน transaction เดียว */
export async function appendConsentEvent(
  input: AppendConsentInput,
  actor: ActorContext,
) {
  const [member] = await db
    .select({
      id: members.id,
      homeBranchId: members.homeBranchId,
      photoUrl: members.photoUrl,
      status: members.status,
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
  if (
    input.consentType === "PHOTO" &&
    input.action === "WITHDRAWN" &&
    member.photoUrl
  ) {
    originalPhotoPath = resolveMemberPhotoPath(member.photoUrl);
    quarantineToken = randomBytes(32).toString("hex");
    const quarantineRoot = path.resolve(
      process.cwd(),
      "public",
      "uploads",
      "privacy-cleanup",
    );
    await mkdir(quarantineRoot, { recursive: true });
    quarantinePath = path.join(quarantineRoot, quarantineToken);
    try {
      await rename(originalPhotoPath, quarantinePath);
    } catch {
      throw new PrivacyOperationError(
        "ไม่สามารถย้ายรูปไปพื้นที่พักไฟล์ได้ จึงยังไม่ถอน consent",
        409,
      );
    }
  }

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
    if (originalPhotoPath && quarantinePath) {
      try {
        await rename(quarantinePath, originalPhotoPath);
      } catch (restoreError) {
        console.error("ไม่สามารถคืนไฟล์รูปจาก quarantine", restoreError);
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
        })
        .where(eq(privacyRequests.id, requestId));
    },
  );
}
