import "server-only";

import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, branches, staff } from "@/db/schema";
import {
  sanitizeAuditMetadata,
  sanitizeAuditMetadataForRead,
} from "@/lib/audit-policy";
import type { ActorContext } from "@/lib/rbac";

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbExecutor = typeof db | DbTransaction;

export type AuditEntry = {
  actorStaffId: number;
  branchId: number | null;
  action: string;
  entityType: string;
  entityId?: number;
  result: "SUCCESS" | "DENIED" | "FAILED";
  metadata?: Record<string, unknown>;
};

export type SystemAuditEntry = Omit<AuditEntry, "actorStaffId"> & {
  actorStaffId: null;
};

export type AuditFilters = {
  branchId?: number;
  action?: string;
  result?: "SUCCESS" | "DENIED" | "FAILED";
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
};

export type AuditDashboardSourceRow = {
  id: number;
  branchId: number | null;
  branchName: string | null;
  actorStaffId: number | null;
  actorFirstName: string | null;
  actorLastName: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  result: "SUCCESS" | "DENIED" | "FAILED";
  metadata: Record<string, unknown> | null;
  createdAt: Date | null;
};

type MutationAuditContext<T> = Omit<AuditEntry, "result"> & {
  /** สร้างรายละเอียดความสำเร็จจากผลลัพธ์โดยไม่ส่งข้อมูลธุรกิจดิบเข้า audit */
  success?: (value: T) => Pick<AuditEntry, "entityId" | "metadata">;
};

const AUDIT_NAME = /^[A-Z0-9_.-]+$/;

/** แปลงชื่อ error เป็นรหัส enum-like โดยไม่บันทึกข้อความซึ่งอาจมี PII */
function getAuditErrorCode(error: unknown) {
  const source = error instanceof Error ? error.name : "UNKNOWN_ERROR";
  const code = source
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9_.-]+/g, "_")
    .toUpperCase();
  return code || "UNKNOWN_ERROR";
}

/** เขียน audit ที่ผ่าน allowlist ด้วย executor เดียวกับข้อมูลธุรกิจ */
export async function writeAudit(
  executor: DbExecutor,
  entry: AuditEntry | SystemAuditEntry,
) {
  if (!AUDIT_NAME.test(entry.action) || !AUDIT_NAME.test(entry.entityType))
    throw new Error("audit action and entity type must be enum-like");
  await executor.insert(auditLogs).values({
    branchId: entry.branchId,
    actorStaffId: entry.actorStaffId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    result: entry.result,
    metadata: sanitizeAuditMetadata(entry.metadata),
  });
}

/** ใช้ transaction ที่ caller ส่งมา หรือเปิด transaction ใหม่เมื่อ service ถูกเรียกโดยตรง */
export async function withTransaction<T>(
  executor: DbTransaction | undefined,
  callback: (tx: DbTransaction) => Promise<T>,
) {
  return executor ? callback(executor) : db.transaction(callback);
}

/** ทำ mutation และ SUCCESS audit ใน transaction เดียวกัน พร้อมบันทึก FAILED แยกหลัง rollback */
export async function runAuditedMutation<T>(
  context: MutationAuditContext<T>,
  callback: (tx: DbTransaction) => Promise<T>,
) {
  const { success: getSuccessAudit, ...baseEntry } = context;
  try {
    return await db.transaction(async (tx) => {
      const value = await callback(tx);
      const success = getSuccessAudit?.(value);
      await writeAudit(tx, {
        ...baseEntry,
        ...success,
        result: "SUCCESS",
      });
      return value;
    });
  } catch (error) {
    try {
      await writeAudit(db, {
        actorStaffId: context.actorStaffId,
        branchId: context.branchId,
        action: context.action,
        entityType: context.entityType,
        entityId: context.entityId,
        result: "FAILED",
        metadata: { errorCode: getAuditErrorCode(error) },
      });
    } catch {
      // ห้ามส่ง error object จากฐานข้อมูลเข้า logger เพราะอาจพก SQL, params หรือข้อมูลอ่อนไหวมาด้วย
      console.error("Failed to write FAILED audit");
    }
    throw error;
  }
}

/** แปลง nullable audit join เป็น DTO ที่มีข้อความ unknown และ metadata ผ่าน read-time redaction */
export function mapAuditDashboardRow(row: AuditDashboardSourceRow) {
  const { actorFirstName, actorLastName, branchName, ...safeRow } = row;
  return {
    ...safeRow,
    branchName: branchName ?? "ไม่ทราบสาขา",
    actorName:
      actorFirstName && actorLastName
        ? `${actorFirstName} ${actorLastName}`.trim()
        : "ไม่ทราบบัญชี",
    metadata: sanitizeAuditMetadataForRead(row.metadata),
    createdAt: row.createdAt?.toISOString() ?? null,
  };
}

/** ให้ Owner เลือกสาขาหรืออ่าน global/null rows ได้ แต่บังคับ Manager อยู่สาขาหลักเพื่อกันข้ามขอบเขต */
export function resolveAuditBranchScope(
  actor: ActorContext,
  requestedBranchId: number | undefined,
) {
  return actor.role === "OWNER" ? requestedBranchId : actor.homeBranchId;
}

/** คืน audit log แบบแบ่งหน้า โดยบังคับผู้ใช้ที่ไม่ใช่ Owner ให้เห็นเฉพาะสาขาหลักของตน */
export async function getAuditDashboard(
  actor: ActorContext,
  filters: AuditFilters,
) {
  const branchId = resolveAuditBranchScope(actor, filters.branchId);
  const conditions = [
    branchId ? eq(auditLogs.branchId, branchId) : undefined,
    filters.action ? eq(auditLogs.action, filters.action) : undefined,
    filters.result ? eq(auditLogs.result, filters.result) : undefined,
    filters.from ? gte(auditLogs.createdAt, filters.from) : undefined,
    filters.to ? lte(auditLogs.createdAt, filters.to) : undefined,
  ].filter((condition) => condition !== undefined);
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        branchId: auditLogs.branchId,
        branchName: branches.name,
        actorStaffId: auditLogs.actorStaffId,
        actorFirstName: staff.firstName,
        actorLastName: staff.lastName,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        result: auditLogs.result,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(branches, eq(auditLogs.branchId, branches.id))
      .leftJoin(staff, eq(auditLogs.actorStaffId, staff.id))
      .where(where)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db.select({ count: sql<number>`count(*)` }).from(auditLogs).where(where),
  ]);
  return {
    rows: rows.map(mapAuditDashboardRow),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      total: Number(countRow?.count ?? 0),
    },
  };
}
