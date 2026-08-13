import "server-only";

import {
  and,
  desc,
  eq,
  gte,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import {
  auditLogs,
  authLoginLimits,
  authSessions,
  branches,
  staff,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit-service";
import {
  sanitizeAuditMetadataForRead,
  truncateAuthFingerprint,
} from "@/lib/audit-policy";
import { createAuthSubjectFingerprint } from "@/lib/auth/request-security";
import {
  canManageStaff,
  hasPermission,
  type ActorContext,
  type StaffRole,
} from "@/lib/rbac";

const AUTH_EVENT_ACTIONS = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGIN_RATE_LIMITED",
  "LOGOUT_SUCCESS",
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
  "PASSWORD_CHANGED",
  "PASSWORD_RESET",
  "AUTH_RATE_LIMIT_CLEARED",
] as const;

type SecurityResult = "SUCCESS" | "DENIED" | "FAILED";
type SessionMode = "FULL" | "PASSWORD_CHANGE_REQUIRED";
type LimitScope = "ACCOUNT" | "IP";

export type SecurityFilters = {
  page: number;
  pageSize: number;
  branchId?: number;
  staffId?: number;
  action?: (typeof AUTH_EVENT_ACTIONS)[number];
  result?: SecurityResult;
  from?: Date;
  to?: Date;
};

export type SecurityStaffSubject = {
  id: number;
  staffCode: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
  homeBranchId: number;
  branchName: string;
};

export type RawSecuritySession = {
  id: number;
  staffId: number;
  firstName: string;
  lastName: string;
  role: StaffRole;
  homeBranchId: number;
  branchName: string;
  mode: SessionMode;
  createdAt: Date;
  lastSeenAt: Date;
  absoluteExpiresAt: Date;
  idleExpiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
  ipFingerprint: string | null;
  userAgentCategory: string | null;
};

export type RawSecurityLimit = {
  id: number;
  scope: LimitScope;
  subjectHash: string;
  attemptCount: number;
  windowStartedAt: Date;
  lockedUntil: Date | null;
  updatedAt: Date;
};

export type RawSecurityEvent = {
  id: number;
  branchId: number | null;
  branchName: string | null;
  actorStaffId: number | null;
  actorFirstName: string | null;
  actorLastName: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  result: SecurityResult;
  metadata: Record<string, unknown> | null;
  createdAt: Date | null;
};

type PageResult<T> = { rows: T[]; total: number };
type PageQuery = { page: number; pageSize: number };
type SessionQuery = PageQuery & { branchId?: number; staffId?: number };
type LimitQuery = PageQuery & { allowedAccountHashes?: string[] };
type EventQuery = PageQuery & Omit<SecurityFilters, "page" | "pageSize">;

type SecurityMutationContext = {
  actor: ActorContext;
  occurredAt: Date;
};

export interface SecurityRepository {
  listStaffSubjects(branchId?: number): Promise<SecurityStaffSubject[]>;
  listSessions(query: SessionQuery): Promise<PageResult<RawSecuritySession>>;
  listLimits(query: LimitQuery): Promise<PageResult<RawSecurityLimit>>;
  listEvents(query: EventQuery): Promise<PageResult<RawSecurityEvent>>;
  findSessionTarget(id: number): Promise<RawSecuritySession | null>;
  findStaffTarget(id: number): Promise<SecurityStaffSubject | null>;
  findLimit(id: number): Promise<RawSecurityLimit | null>;
  revokeSessionWithAudit(input: SecurityMutationContext & { sessionId: number }): Promise<void>;
  revokeStaffSessionsWithAudit(input: SecurityMutationContext & { staffId: number }): Promise<void>;
  clearLimitWithAudit(input: SecurityMutationContext & { limitId: number }): Promise<void>;
}

export class SecurityOperationError extends Error {
  constructor(message: string, public readonly status: 403 | 404 | 409) {
    super(message);
    this.name = "SecurityOperationError";
  }
}

/** ย่อ fingerprint สำหรับการระบุรายการใน UI โดยไม่เปิดเผย HMAC เต็ม */
function shortenFingerprint(value: string | null): string | null {
  return truncateAuthFingerprint(value);
}

/** แปลงวันที่จากฐานข้อมูลเป็น DTO ที่ serialize ได้โดยรักษาค่า null */
function toIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

/** คืน metadata เฉพาะ reason/device/fingerprint แบบย่อ เพื่อไม่ส่งข้อมูลดิบหรือ key อื่นจาก audit ไปยัง client */
function toSafeEventMetadata(
  metadata: Record<string, unknown> | null,
): Record<string, unknown> | null {
  return sanitizeAuditMetadataForRead(metadata);
}

/** ป้องกันการเรียก service โดยตรงที่ข้าม Route Handler permission guard */
function requireSecurityPermission(actor: ActorContext, permission: "auth.security.read" | "auth.security.manage") {
  if (!hasPermission(actor, permission)) {
    throw new SecurityOperationError("ไม่มีสิทธิ์จัดการความปลอดภัยของระบบ", 403);
  }
}

/** ใช้กฎ Staff เดียวกับระบบ RBAC เพื่อกัน Manager จัดการ Owner หรือข้ามสาขา */
function requireManageableTarget(
  actor: ActorContext,
  target: { role: StaffRole; homeBranchId: number },
) {
  if (!canManageStaff(actor, target)) {
    throw new SecurityOperationError("ไม่มีสิทธิ์จัดการบัญชีเป้าหมายนี้", 403);
  }
}

/** ประกอบ backend service ที่แยก policy/DTO ออกจาก Drizzle เพื่อทดสอบขอบเขตข้อมูลและสิทธิ์ได้โดยไม่แตะฐานข้อมูลจริง */
export function createSecurityService(dependencies: {
  repository: SecurityRepository;
  now: () => Date;
}) {
  const { repository } = dependencies;

  /** โหลดทั้งสามชุดข้อมูลแบบแบ่งหน้า โดย Manager ถูกบังคับสาขาและ rate-limit subject ถูก resolve ฝั่งเซิร์ฟเวอร์เท่านั้น */
  async function getSecurityDashboard(
    actor: ActorContext,
    filters: SecurityFilters,
  ) {
    requireSecurityPermission(actor, "auth.security.read");
    const branchId = actor.role === "OWNER" ? filters.branchId : actor.homeBranchId;
    const staffSubjects = await repository.listStaffSubjects(
      actor.role === "OWNER" ? undefined : actor.homeBranchId,
    );
    const subjectByHash = new Map(
      staffSubjects.map((subject) => [
        createAuthSubjectFingerprint(subject.staffCode.trim().toUpperCase()),
        subject,
      ]),
    );
    const allowedAccountHashes =
      actor.role === "OWNER" ? undefined : [...subjectByHash.keys()];

    const [sessionPage, limitPage, eventPage] = await Promise.all([
      repository.listSessions({
        page: filters.page,
        pageSize: filters.pageSize,
        branchId,
        staffId: filters.staffId,
      }),
      repository.listLimits({
        page: filters.page,
        pageSize: filters.pageSize,
        allowedAccountHashes,
      }),
      repository.listEvents({ ...filters, branchId }),
    ]);
    const now = dependencies.now();

    return {
      sessions: {
        rows: sessionPage.rows.map((row) => ({
          id: row.id,
          staffId: row.staffId,
          staffName: `${row.firstName} ${row.lastName}`.trim(),
          role: row.role,
          homeBranchId: row.homeBranchId,
          branchName: row.branchName,
          mode: row.mode,
          createdAt: toIso(row.createdAt),
          lastSeenAt: toIso(row.lastSeenAt),
          absoluteExpiresAt: toIso(row.absoluteExpiresAt),
          idleExpiresAt: toIso(row.idleExpiresAt),
          revokedAt: toIso(row.revokedAt),
          revokedReason: row.revokedReason,
          status: row.revokedAt
            ? "REVOKED"
            : row.absoluteExpiresAt <= now || row.idleExpiresAt <= now
              ? "EXPIRED"
              : "ACTIVE",
          ipFingerprint: shortenFingerprint(row.ipFingerprint),
          userAgentCategory: row.userAgentCategory ?? "UNKNOWN",
          manageable: canManageStaff(actor, row),
        })),
        pagination: { page: filters.page, pageSize: filters.pageSize, total: sessionPage.total },
      },
      limits: {
        rows: limitPage.rows.map((row) => {
          const target = row.scope === "ACCOUNT" ? subjectByHash.get(row.subjectHash) ?? null : null;
          return {
            id: row.id,
            scope: row.scope,
            fingerprint: shortenFingerprint(row.subjectHash),
            attemptCount: row.attemptCount,
            windowStartedAt: toIso(row.windowStartedAt),
            lockedUntil: toIso(row.lockedUntil),
            updatedAt: toIso(row.updatedAt),
            locked: Boolean(row.lockedUntil && row.lockedUntil > now),
            staff: target
              ? {
                  id: target.id,
                  name: `${target.firstName} ${target.lastName}`.trim(),
                  role: target.role,
                  homeBranchId: target.homeBranchId,
                  branchName: target.branchName,
                }
              : null,
            manageable:
              actor.role === "OWNER" || Boolean(target && canManageStaff(actor, target)),
          };
        }),
        pagination: { page: filters.page, pageSize: filters.pageSize, total: limitPage.total },
      },
      events: {
        rows: eventPage.rows.map((row) => ({
          id: row.id,
          branchId: row.branchId,
          branchName: row.branchName,
          actorStaffId: row.actorStaffId,
          actorName:
            row.actorFirstName && row.actorLastName
              ? `${row.actorFirstName} ${row.actorLastName}`.trim()
              : null,
          action: row.action,
          entityType: row.entityType,
          entityId: row.entityId,
          result: row.result,
          metadata: toSafeEventMetadata(row.metadata),
          createdAt: toIso(row.createdAt),
        })),
        pagination: { page: filters.page, pageSize: filters.pageSize, total: eventPage.total },
      },
    };
  }

  /** ตรวจเป้าหมายก่อนส่งให้ repository ล็อกซ้ำและ revoke/audit ภายใน transaction เดียว */
  async function revokeSecuritySession(actor: ActorContext, sessionId: number) {
    requireSecurityPermission(actor, "auth.security.manage");
    const target = await repository.findSessionTarget(sessionId);
    if (!target) throw new SecurityOperationError("ไม่พบ session", 404);
    requireManageableTarget(actor, target);
    await repository.revokeSessionWithAudit({ actor, sessionId, occurredAt: dependencies.now() });
  }

  /** revoke session ทั้งหมดของ Staff เฉพาะเป้าหมายที่ actor จัดการได้ */
  async function revokeStaffSessions(actor: ActorContext, staffId: number) {
    requireSecurityPermission(actor, "auth.security.manage");
    const target = await repository.findStaffTarget(staffId);
    if (!target) throw new SecurityOperationError("ไม่พบบัญชีพนักงาน", 404);
    requireManageableTarget(actor, target);
    await repository.revokeStaffSessionsWithAudit({ actor, staffId, occurredAt: dependencies.now() });
  }

  /** resolve ACCOUNT fingerprint จาก staff code ภายใน server และห้าม Manager clear IP, unknown หรือ Owner bucket */
  async function clearLoginLimit(actor: ActorContext, limitId: number) {
    requireSecurityPermission(actor, "auth.security.manage");
    const limit = await repository.findLimit(limitId);
    if (!limit) throw new SecurityOperationError("ไม่พบ rate limit", 404);
    if (actor.role !== "OWNER") {
      if (limit.scope !== "ACCOUNT") {
        throw new SecurityOperationError("ไม่มีสิทธิ์ปลดล็อก rate limit นี้", 403);
      }
      const subjects = await repository.listStaffSubjects(actor.homeBranchId);
      const target = subjects.find(
        (subject) =>
          createAuthSubjectFingerprint(subject.staffCode.trim().toUpperCase()) ===
          limit.subjectHash,
      );
      if (!target) throw new SecurityOperationError("ไม่มีสิทธิ์ปลดล็อก rate limit นี้", 403);
      requireManageableTarget(actor, target);
    }
    await repository.clearLimitWithAudit({ actor, limitId, occurredAt: dependencies.now() });
  }

  return { getSecurityDashboard, revokeSecuritySession, revokeStaffSessions, clearLoginLimit };
}

/** คำนวณ offset ฝั่ง server จากหน้าที่ผ่าน validation แล้ว */
function pageOffset(query: PageQuery) {
  return (query.page - 1) * query.pageSize;
}

export class DrizzleSecurityRepository implements SecurityRepository {
  /** อ่าน Staff code ภายใน server เพื่อสร้าง HMAC mapping โดยไม่ส่ง code ออก DTO */
  async listStaffSubjects(branchId?: number) {
    return db
      .select({
        id: staff.id,
        staffCode: staff.staffCode,
        firstName: staff.firstName,
        lastName: staff.lastName,
        role: staff.role,
        homeBranchId: staff.homeBranchId,
        branchName: branches.name,
      })
      .from(staff)
      .innerJoin(branches, eq(staff.homeBranchId, branches.id))
      .where(branchId ? eq(staff.homeBranchId, branchId) : undefined);
  }

  /** เลือกเฉพาะข้อมูล session ที่แสดงผลได้และไม่แตะ session token hash */
  async listSessions(query: SessionQuery): Promise<PageResult<RawSecuritySession>> {
    const where = and(
      query.branchId ? eq(staff.homeBranchId, query.branchId) : undefined,
      query.staffId ? eq(staff.id, query.staffId) : undefined,
    );
    const [rows, [countRow]] = await Promise.all([
      db
        .select({
          id: authSessions.id,
          staffId: staff.id,
          firstName: staff.firstName,
          lastName: staff.lastName,
          role: staff.role,
          homeBranchId: staff.homeBranchId,
          branchName: branches.name,
          mode: authSessions.mode,
          createdAt: authSessions.createdAt,
          lastSeenAt: authSessions.lastSeenAt,
          absoluteExpiresAt: authSessions.absoluteExpiresAt,
          idleExpiresAt: authSessions.idleExpiresAt,
          revokedAt: authSessions.revokedAt,
          revokedReason: authSessions.revokedReason,
          ipFingerprint: authSessions.ipFingerprint,
          userAgentCategory: authSessions.userAgentCategory,
        })
        .from(authSessions)
        .innerJoin(staff, eq(authSessions.staffId, staff.id))
        .innerJoin(branches, eq(staff.homeBranchId, branches.id))
        .where(where)
        .orderBy(desc(authSessions.createdAt), desc(authSessions.id))
        .limit(query.pageSize)
        .offset(pageOffset(query)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(authSessions)
        .innerJoin(staff, eq(authSessions.staffId, staff.id))
        .where(where),
    ]);
    return { rows, total: Number(countRow?.count ?? 0) };
  }

  /** จำกัด Manager ด้วย HMAC allowlist เพื่อไม่ส่ง subject hash ทั้งหมดออกจาก query boundary */
  async listLimits(query: LimitQuery): Promise<PageResult<RawSecurityLimit>> {
    const where = query.allowedAccountHashes
      ? and(
          eq(authLoginLimits.scope, "ACCOUNT"),
          query.allowedAccountHashes.length
            ? inArray(authLoginLimits.subjectHash, query.allowedAccountHashes)
            : sql`false`,
        )
      : undefined;
    const [rows, [countRow]] = await Promise.all([
      db
        .select({
          id: authLoginLimits.id,
          scope: authLoginLimits.scope,
          subjectHash: authLoginLimits.subjectHash,
          attemptCount: authLoginLimits.attemptCount,
          windowStartedAt: authLoginLimits.windowStartedAt,
          lockedUntil: authLoginLimits.lockedUntil,
          updatedAt: authLoginLimits.updatedAt,
        })
        .from(authLoginLimits)
        .where(where)
        .orderBy(desc(authLoginLimits.updatedAt), desc(authLoginLimits.id))
        .limit(query.pageSize)
        .offset(pageOffset(query)),
      db.select({ count: sql<number>`count(*)` }).from(authLoginLimits).where(where),
    ]);
    return { rows, total: Number(countRow?.count ?? 0) };
  }

  /** ใช้ left join เพื่อคง unknown actor/branch สำหรับ Owner และบังคับ Manager ด้วย branch predicate */
  async listEvents(query: EventQuery): Promise<PageResult<RawSecurityEvent>> {
    const where = and(
      inArray(auditLogs.action, [...AUTH_EVENT_ACTIONS]),
      query.branchId ? eq(auditLogs.branchId, query.branchId) : undefined,
      query.staffId ? eq(auditLogs.actorStaffId, query.staffId) : undefined,
      query.action ? eq(auditLogs.action, query.action) : undefined,
      query.result ? eq(auditLogs.result, query.result) : undefined,
      query.from ? gte(auditLogs.createdAt, query.from) : undefined,
      query.to ? lte(auditLogs.createdAt, query.to) : undefined,
    );
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
        .limit(query.pageSize)
        .offset(pageOffset(query)),
      db.select({ count: sql<number>`count(*)` }).from(auditLogs).where(where),
    ]);
    return { rows, total: Number(countRow?.count ?? 0) };
  }

  /** อ่าน session พร้อม role/branch เป้าหมายสำหรับ authorization ก่อน mutation */
  async findSessionTarget(id: number) {
    const [row] = await db
      .select({
        id: authSessions.id,
        staffId: staff.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        role: staff.role,
        homeBranchId: staff.homeBranchId,
        branchName: branches.name,
        mode: authSessions.mode,
        createdAt: authSessions.createdAt,
        lastSeenAt: authSessions.lastSeenAt,
        absoluteExpiresAt: authSessions.absoluteExpiresAt,
        idleExpiresAt: authSessions.idleExpiresAt,
        revokedAt: authSessions.revokedAt,
        revokedReason: authSessions.revokedReason,
        ipFingerprint: authSessions.ipFingerprint,
        userAgentCategory: authSessions.userAgentCategory,
      })
      .from(authSessions)
      .innerJoin(staff, eq(authSessions.staffId, staff.id))
      .innerJoin(branches, eq(staff.homeBranchId, branches.id))
      .where(eq(authSessions.id, id))
      .limit(1);
    return row ?? null;
  }

  /** อ่าน Staff เป้าหมายพร้อมขอบเขตที่ canManageStaff ต้องใช้ */
  async findStaffTarget(id: number) {
    const [row] = await db
      .select({
        id: staff.id,
        staffCode: staff.staffCode,
        firstName: staff.firstName,
        lastName: staff.lastName,
        role: staff.role,
        homeBranchId: staff.homeBranchId,
        branchName: branches.name,
      })
      .from(staff)
      .innerJoin(branches, eq(staff.homeBranchId, branches.id))
      .where(eq(staff.id, id))
      .limit(1);
    return row ?? null;
  }

  /** อ่าน rate-limit bucket ภายใน server โดยไม่เปิดเผย subject hash ต่อ route */
  async findLimit(id: number) {
    const [row] = await db
      .select({
        id: authLoginLimits.id,
        scope: authLoginLimits.scope,
        subjectHash: authLoginLimits.subjectHash,
        attemptCount: authLoginLimits.attemptCount,
        windowStartedAt: authLoginLimits.windowStartedAt,
        lockedUntil: authLoginLimits.lockedUntil,
        updatedAt: authLoginLimits.updatedAt,
      })
      .from(authLoginLimits)
      .where(eq(authLoginLimits.id, id))
      .limit(1);
    return row ?? null;
  }

  /** ล็อกและตรวจเป้าหมายซ้ำก่อน revoke/audit เพื่อปิด TOCTOU และคง idempotency */
  async revokeSessionWithAudit(input: SecurityMutationContext & { sessionId: number }) {
    await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ id: authSessions.id, revokedAt: authSessions.revokedAt, role: staff.role, homeBranchId: staff.homeBranchId })
        .from(authSessions)
        .innerJoin(staff, eq(authSessions.staffId, staff.id))
        .where(eq(authSessions.id, input.sessionId))
        .limit(1)
        .for("update");
      if (!target) throw new SecurityOperationError("ไม่พบ session", 404);
      requireManageableTarget(input.actor, target);
      if (target.revokedAt) return;
      const result = await tx
        .update(authSessions)
        .set({ revokedAt: input.occurredAt, revokedReason: "ADMIN_REVOKED" })
        .where(and(eq(authSessions.id, target.id), isNull(authSessions.revokedAt)));
      if (result[0].affectedRows === 0) return;
      await writeAudit(tx, {
        actorStaffId: input.actor.staffId,
        branchId: target.homeBranchId,
        action: "SESSION_REVOKED",
        entityType: "AUTH_SESSION",
        entityId: target.id,
        result: "SUCCESS",
        metadata: { source: "SECURITY_ADMIN" },
      });
    });
  }

  /** revoke session ที่ยัง active ของ Staff ทั้งหมดและ audit จำนวนที่เปลี่ยนใน transaction เดียว */
  async revokeStaffSessionsWithAudit(input: SecurityMutationContext & { staffId: number }) {
    await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ id: staff.id, role: staff.role, homeBranchId: staff.homeBranchId })
        .from(staff)
        .where(eq(staff.id, input.staffId))
        .limit(1)
        .for("update");
      if (!target) throw new SecurityOperationError("ไม่พบบัญชีพนักงาน", 404);
      requireManageableTarget(input.actor, target);
      const result = await tx
        .update(authSessions)
        .set({ revokedAt: input.occurredAt, revokedReason: "ADMIN_REVOKED" })
        .where(and(eq(authSessions.staffId, target.id), isNull(authSessions.revokedAt)));
      const count = result[0].affectedRows;
      if (count === 0) return;
      await writeAudit(tx, {
        actorStaffId: input.actor.staffId,
        branchId: target.homeBranchId,
        action: "SESSION_REVOKED",
        entityType: "STAFF",
        entityId: target.id,
        result: "SUCCESS",
        metadata: { source: "SECURITY_ADMIN", count },
      });
    });
  }

  /** reset bucket แทนการลบและ resolve ACCOUNT target ใต้ lock เดียวกัน เพื่อให้ idempotent พร้อม audit สาขาที่ถูกต้อง */
  async clearLimitWithAudit(input: SecurityMutationContext & { limitId: number }) {
    await db.transaction(async (tx) => {
      const [limit] = await tx
        .select({ id: authLoginLimits.id, scope: authLoginLimits.scope, subjectHash: authLoginLimits.subjectHash })
        .from(authLoginLimits)
        .where(eq(authLoginLimits.id, input.limitId))
        .limit(1)
        .for("update");
      if (!limit) return;

      if (input.actor.role !== "OWNER" && limit.scope !== "ACCOUNT") {
        throw new SecurityOperationError("ไม่มีสิทธิ์ปลดล็อก rate limit นี้", 403);
      }

      let target: {
        id: number;
        staffCode: string;
        role: StaffRole;
        homeBranchId: number;
      } | null = null;
      if (limit.scope === "ACCOUNT") {
        const subjects = await tx
          .select({
            id: staff.id,
            staffCode: staff.staffCode,
            role: staff.role,
            homeBranchId: staff.homeBranchId,
          })
          .from(staff)
          .where(
            input.actor.role === "OWNER"
              ? undefined
              : eq(staff.homeBranchId, input.actor.homeBranchId),
          )
          .for("update");
        target = subjects.find(
          (row) => createAuthSubjectFingerprint(row.staffCode.trim().toUpperCase()) === limit.subjectHash,
        ) ?? null;
      }

      if (input.actor.role !== "OWNER") {
        if (!target) {
          throw new SecurityOperationError("ไม่มีสิทธิ์ปลดล็อก rate limit นี้", 403);
        }
        requireManageableTarget(input.actor, target);
      }
      const result = await tx
        .update(authLoginLimits)
        .set({
          attemptCount: 0,
          lockedUntil: null,
          windowStartedAt: input.occurredAt,
          updatedAt: input.occurredAt,
        })
        .where(
          and(
            eq(authLoginLimits.id, limit.id),
            or(
              gt(authLoginLimits.attemptCount, 0),
              isNotNull(authLoginLimits.lockedUntil),
            ),
          ),
        );
      if (result[0].affectedRows === 0) return;
      await writeAudit(tx, {
        actorStaffId: input.actor.staffId,
        branchId: target?.homeBranchId ?? null,
        action: "AUTH_RATE_LIMIT_CLEARED",
        entityType: "AUTH_LOGIN_LIMIT",
        entityId: limit.id,
        result: "SUCCESS",
        metadata: { source: "SECURITY_ADMIN", scope: limit.scope },
      });
    });
  }
}

const defaultSecurityService = createSecurityService({
  repository: new DrizzleSecurityRepository(),
  now: () => new Date(),
});

export const getSecurityDashboard = defaultSecurityService.getSecurityDashboard;
export const revokeSecuritySession = defaultSecurityService.revokeSecuritySession;
export const revokeStaffSessions = defaultSecurityService.revokeStaffSessions;
export const clearLoginLimit = defaultSecurityService.clearLoginLimit;
