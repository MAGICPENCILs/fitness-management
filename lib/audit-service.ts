import "server-only";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { sanitizeAuditMetadata } from "@/lib/audit-policy";

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbExecutor = typeof db | DbTransaction;

export type AuditEntry = {
  actorStaffId: number;
  branchId: number;
  action: string;
  entityType: string;
  entityId?: number;
  result: "SUCCESS" | "DENIED" | "FAILED";
  metadata?: Record<string, unknown>;
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
export async function writeAudit(executor: DbExecutor, entry: AuditEntry) {
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
    } catch (auditError) {
      console.error("Failed to write FAILED audit", auditError);
    }
    throw error;
  }
}
