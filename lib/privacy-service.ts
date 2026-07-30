import "server-only";

import { randomBytes } from "crypto";
import { mkdir, rename } from "fs/promises";
import path from "path";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  consentEvents,
  members,
  privacyFileCleanups,
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
    )
      throw new AuthorizationError("ไม่มีสิทธิ์ดู consent ของสาขานี้", 403);
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
