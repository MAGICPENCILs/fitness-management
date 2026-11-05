import "server-only";

import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, authLoginLimits, authSessions, staff, staffTotp, staffTotpRecoveryCodes } from "@/db/schema";
import { AuthError } from "@/lib/auth/auth-errors";
import type { UserAgentCategory } from "@/lib/auth/types";
import {
  ACCOUNT_POLICY,
  evaluateRateLimit,
  IP_POLICY,
  type RateLimitDecision,
} from "@/lib/auth/rate-limit-core";
import type { SessionMode } from "@/lib/auth/types";
import type { StaffRole } from "@/lib/rbac";

export type RateLimitScope = "ACCOUNT" | "IP";

export type RateLimitCheck = {
  blocked: boolean;
  lockedUntil: Date | null;
  retryAfterSeconds: number;
};

export type LoginStaff = {
  id: number;
  homeBranchId: number;
  role: StaffRole;
  status: "ACTIVE" | "INACTIVE";
  passwordHash: string | null;
  mustChangePassword: boolean;
  totpStatus?: "PENDING" | "ENABLED" | "DISABLED" | null;
  encryptedTotpSecret?: string | null;
  lastUsedTotpStep?: number | null;
};

type AuthAuditRequest = {
  ipFingerprint: string | null;
  userAgentCategory: UserAgentCategory;
};

type AuthAuditIdentity =
  | { actorStaffId: number; branchId: number }
  | { actorStaffId: null; branchId: null };

export type LoginAuditInput = AuthAuditRequest & AuthAuditIdentity & {
  action: "LOGIN_FAILED" | "LOGIN_RATE_LIMITED";
  result: "FAILED" | "DENIED";
  reasonCode: "INVALID_CREDENTIALS" | "RATE_LIMITED";
  occurredAt: Date;
};

export type CreateSessionInput = AuthAuditRequest & {
  accountSubjectHash: string;
  staffId: number;
  branchId: number;
  sessionTokenHash: string;
  mode: SessionMode;
  createdAt: Date;
  lastSeenAt: Date;
  absoluteExpiresAt: Date;
  idleExpiresAt: Date;
};

export type RevokeSessionInput = AuthAuditRequest & {
  sessionTokenHash: string;
  revokedAt: Date;
};

export type ChangePasswordSessionInput = {
  currentAuthSessionId: number;
  staffId: number;
  branchId: number;
  passwordHash: string;
  passwordChangedAt: Date;
  newSession: AuthAuditRequest & {
    sessionTokenHash: string;
    mode: "FULL";
    createdAt: Date;
    lastSeenAt: Date;
    absoluteExpiresAt: Date;
    idleExpiresAt: Date;
  };
};

export interface AuthRepository {
  findLoginStaff(staffCode: string): Promise<LoginStaff | null>;
  checkLimit(
    scope: RateLimitScope,
    subjectHash: string,
    now: Date,
  ): Promise<RateLimitCheck>;
  consumeFailure(
    scope: RateLimitScope,
    subjectHash: string,
    now: Date,
  ): Promise<RateLimitDecision>;
  writeLoginAudit(input: LoginAuditInput): Promise<void>;
  createSessionAndAudit(input: CreateSessionInput): Promise<void>;
  revokeSessionAndAudit(input: RevokeSessionInput): Promise<void>;
  changePasswordAndRotateSession(
    input: ChangePasswordSessionInput,
  ): Promise<void>;
  claimTotpStep?(staffId: number, step: number): Promise<boolean>;
  consumeTotpRecoveryCode?(staffId: number, codeHash: string, usedAt: Date): Promise<boolean>;
}

type AuthDbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type AuthDbExecutor = typeof db | AuthDbTransaction;

type AuthAuditInsert = AuthAuditRequest & AuthAuditIdentity & {
  action:
    | "LOGIN_FAILED"
    | "LOGIN_RATE_LIMITED"
    | "LOGIN_SUCCESS"
    | "LOGOUT_SUCCESS"
    | "PASSWORD_CHANGED";
  entityType: "AUTH_LOGIN" | "AUTH_SESSION" | "STAFF";
  entityId?: number;
  result: "SUCCESS" | "DENIED" | "FAILED";
  occurredAt: Date;
  reasonCode?: "INVALID_CREDENTIALS" | "RATE_LIMITED";
};

/** สร้าง metadata จาก field ที่ผ่าน type allowlist เท่านั้น เพื่อกัน raw credential, staff code, IP และ user-agent หลุดเข้า audit */
function createAuthAuditMetadata(input: AuthAuditInsert) {
  return {
    ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
    ...(input.ipFingerprint
      ? { ipFingerprint: input.ipFingerprint }
      : {}),
    userAgentCategory: input.userAgentCategory,
  };
}

/** เขียน auth audit ด้วย executor เดียวกับ mutation เมื่อ caller ต้องการ atomic commit/rollback */
async function insertAuthAudit(
  executor: AuthDbExecutor,
  input: AuthAuditInsert,
) {
  await executor.insert(auditLogs).values({
    actorStaffId: input.actorStaffId,
    branchId: input.branchId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    result: input.result,
    metadata: createAuthAuditMetadata(input),
    createdAt: input.occurredAt,
  });
}

/** แปลง lock timestamp เป็นผลตรวจแบบ read-only โดยไม่เพิ่ม counter หรือแก้ window */
function toRateLimitCheck(
  lockedUntil: Date | null,
  now: Date,
): RateLimitCheck {
  const blocked = Boolean(lockedUntil && lockedUntil.getTime() > now.getTime());
  return {
    blocked,
    lockedUntil,
    retryAfterSeconds: blocked
      ? Math.ceil((lockedUntil!.getTime() - now.getTime()) / 1_000)
      : 0,
  };
}

class DrizzleAuthRepository implements AuthRepository {
  /** อ่านเฉพาะ field ที่ Login ต้องใช้ เพื่อไม่กระจาย password hash ไปยัง DTO ทั่วไป */
  async findLoginStaff(staffCode: string): Promise<LoginStaff | null> {
    const [row] = await db
      .select({
        id: staff.id,
        homeBranchId: staff.homeBranchId,
        role: staff.role,
        status: staff.status,
        passwordHash: staff.passwordHash,
        mustChangePassword: staff.mustChangePassword,
        totpStatus: staffTotp.status,
        encryptedTotpSecret: staffTotp.encryptedSecret,
        lastUsedTotpStep: staffTotp.lastUsedStep,
      })
      .from(staff)
      .leftJoin(staffTotp, eq(staffTotp.staffId, staff.id))
      .where(eq(staff.staffCode, staffCode))
      .limit(1);
    return row ?? null;
  }

  /** claim time step แบบ atomic เพื่อให้ TOTP code เดียวสร้าง session ได้เพียงครั้งเดียว */
  async claimTotpStep(staffId: number, step: number) {
    const result = await db.update(staffTotp).set({ lastUsedStep: step }).where(and(eq(staffTotp.staffId, staffId), eq(staffTotp.status, "ENABLED"), or(isNull(staffTotp.lastUsedStep), lt(staffTotp.lastUsedStep, step))));
    return result[0].affectedRows === 1;
  }

  /** consume recovery code ครั้งเดียวหลัง password ผ่านแล้ว */
  async consumeTotpRecoveryCode(staffId: number, codeHash: string, usedAt: Date) {
    const result = await db.update(staffTotpRecoveryCodes).set({ usedAt }).where(and(eq(staffTotpRecoveryCodes.staffId, staffId), eq(staffTotpRecoveryCodes.codeHash, codeHash), isNull(staffTotpRecoveryCodes.usedAt)));
    return result[0].affectedRows === 1;
  }

  /** ตรวจ lock ปัจจุบันโดยไม่เพิ่ม attempt เพื่อให้รหัสผ่านที่ถูกต้องไม่ข้าม lock เดิม */
  async checkLimit(
    scope: RateLimitScope,
    subjectHash: string,
    now: Date,
  ): Promise<RateLimitCheck> {
    const [row] = await db
      .select({ lockedUntil: authLoginLimits.lockedUntil })
      .from(authLoginLimits)
      .where(
        and(
          eq(authLoginLimits.scope, scope),
          eq(authLoginLimits.subjectHash, subjectHash),
        ),
      )
      .limit(1);
    return toRateLimitCheck(row?.lockedUntil ?? null, now);
  }

  /** ล็อก row และคำนวณ failure ภายใน transaction เดียว เพื่อให้ concurrent request ไม่อ่าน attempt เดิมซ้ำกัน */
  async consumeFailure(
    scope: RateLimitScope,
    subjectHash: string,
    now: Date,
  ): Promise<RateLimitDecision> {
    return db.transaction(async (tx) => {
      await tx
        .insert(authLoginLimits)
        .values({
          scope,
          subjectHash,
          attemptCount: 0,
          windowStartedAt: now,
          lockedUntil: null,
          updatedAt: now,
        })
        .onDuplicateKeyUpdate({
          set: { subjectHash: sql`${authLoginLimits.subjectHash}` },
        });

      const [row] = await tx
        .select({
          id: authLoginLimits.id,
          attempts: authLoginLimits.attemptCount,
          windowStartedAt: authLoginLimits.windowStartedAt,
          lockedUntil: authLoginLimits.lockedUntil,
        })
        .from(authLoginLimits)
        .where(
          and(
            eq(authLoginLimits.scope, scope),
            eq(authLoginLimits.subjectHash, subjectHash),
          ),
        )
        .limit(1)
        .for("update");

      if (!row) throw new Error("Failed to lock authentication limit row");

      const decision = evaluateRateLimit(
        row,
        scope === "ACCOUNT" ? ACCOUNT_POLICY : IP_POLICY,
        now,
      );

      await tx
        .update(authLoginLimits)
        .set({
          attemptCount: decision.attempts,
          windowStartedAt: decision.windowStartedAt,
          lockedUntil: decision.lockedUntil,
          updatedAt: now,
        })
        .where(eq(authLoginLimits.id, row.id));

      return decision;
    });
  }

  /** เขียน failure/rate-limit event เดียวหลัง bucket ทั้งหมดตัดสินแล้ว โดย unknown Staff คง actor/branch เป็น null */
  async writeLoginAudit(input: LoginAuditInput): Promise<void> {
    await insertAuthAudit(db, {
      ...input,
      entityType: "AUTH_LOGIN",
    });
  }

  /** ล้าง ACCOUNT bucket, สร้าง session และ LOGIN_SUCCESS ใน transaction เดียว เพื่อ rollback security state พร้อมกันเมื่อขั้นใดล้มเหลว */
  async createSessionAndAudit(input: CreateSessionInput): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .delete(authLoginLimits)
        .where(
          and(
            eq(authLoginLimits.scope, "ACCOUNT"),
            eq(authLoginLimits.subjectHash, input.accountSubjectHash),
          ),
        );

      const [created] = await tx
        .insert(authSessions)
        .values({
          staffId: input.staffId,
          sessionTokenHash: input.sessionTokenHash,
          mode: input.mode,
          createdAt: input.createdAt,
          lastSeenAt: input.lastSeenAt,
          absoluteExpiresAt: input.absoluteExpiresAt,
          idleExpiresAt: input.idleExpiresAt,
          ipFingerprint: input.ipFingerprint,
          userAgentCategory: input.userAgentCategory,
        })
        .$returningId();

      if (!created) throw new Error("Failed to create authentication session");

      await insertAuthAudit(tx, {
        actorStaffId: input.staffId,
        branchId: input.branchId,
        action: "LOGIN_SUCCESS",
        entityType: "AUTH_SESSION",
        entityId: created.id,
        result: "SUCCESS",
        occurredAt: input.createdAt,
        ipFingerprint: input.ipFingerprint,
        userAgentCategory: input.userAgentCategory,
      });
    });
  }

  /** ล็อก session ก่อน revoke และเขียน LOGOUT_SUCCESS ใน transaction เดียว; session ที่หายหรือถูก revoke แล้วสำเร็จแบบ idempotent */
  async revokeSessionAndAudit(input: RevokeSessionInput): Promise<void> {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          id: authSessions.id,
          staffId: authSessions.staffId,
          branchId: staff.homeBranchId,
          revokedAt: authSessions.revokedAt,
        })
        .from(authSessions)
        .innerJoin(staff, eq(authSessions.staffId, staff.id))
        .where(eq(authSessions.sessionTokenHash, input.sessionTokenHash))
        .limit(1)
        .for("update");

      if (!row || row.revokedAt) return;

      await tx
        .update(authSessions)
        .set({ revokedAt: input.revokedAt, revokedReason: "LOGOUT" })
        .where(
          and(
            eq(authSessions.id, row.id),
            isNull(authSessions.revokedAt),
          ),
        );

      await insertAuthAudit(tx, {
        actorStaffId: row.staffId,
        branchId: row.branchId,
        action: "LOGOUT_SUCCESS",
        entityType: "AUTH_SESSION",
        entityId: row.id,
        result: "SUCCESS",
        occurredAt: input.revokedAt,
        ipFingerprint: input.ipFingerprint,
        userAgentCategory: input.userAgentCategory,
      });
    });
  }

  /** ล็อก session ปัจจุบันก่อนเปลี่ยน hash แล้ว revoke session เดิมทั้งหมด สร้าง FULL session และ audit ใน transaction เดียว */
  async changePasswordAndRotateSession(
    input: ChangePasswordSessionInput,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      const [currentSession] = await tx
        .select({
          staffId: authSessions.staffId,
          mode: authSessions.mode,
          revokedAt: authSessions.revokedAt,
          absoluteExpiresAt: authSessions.absoluteExpiresAt,
          idleExpiresAt: authSessions.idleExpiresAt,
        })
        .from(authSessions)
        .where(eq(authSessions.id, input.currentAuthSessionId))
        .limit(1)
        .for("update");

      if (
        !currentSession ||
        currentSession.staffId !== input.staffId ||
        currentSession.mode !== "PASSWORD_CHANGE_REQUIRED" ||
        currentSession.revokedAt ||
        currentSession.absoluteExpiresAt.getTime() <=
          input.passwordChangedAt.getTime() ||
        currentSession.idleExpiresAt.getTime() <=
          input.passwordChangedAt.getTime()
      ) {
        throw new AuthError(
          "SESSION_INVALID",
          401,
          "เซสชันไม่สามารถใช้งานได้",
        );
      }

      const staffUpdate = await tx
        .update(staff)
        .set({
          passwordHash: input.passwordHash,
          passwordChangedAt: input.passwordChangedAt,
          mustChangePassword: false,
        })
        .where(and(eq(staff.id, input.staffId), eq(staff.status, "ACTIVE")));
      if (staffUpdate[0].affectedRows === 0) {
        throw new AuthError(
          "SESSION_INVALID",
          401,
          "บัญชีพนักงานไม่สามารถใช้งานได้",
        );
      }

      await tx
        .update(authSessions)
        .set({
          revokedAt: input.passwordChangedAt,
          revokedReason: "PASSWORD_CHANGED",
        })
        .where(
          and(
            eq(authSessions.staffId, input.staffId),
            isNull(authSessions.revokedAt),
          ),
        );

      await tx.insert(authSessions).values({
        staffId: input.staffId,
        sessionTokenHash: input.newSession.sessionTokenHash,
        mode: input.newSession.mode,
        createdAt: input.newSession.createdAt,
        lastSeenAt: input.newSession.lastSeenAt,
        absoluteExpiresAt: input.newSession.absoluteExpiresAt,
        idleExpiresAt: input.newSession.idleExpiresAt,
        ipFingerprint: input.newSession.ipFingerprint,
        userAgentCategory: input.newSession.userAgentCategory,
      });

      await insertAuthAudit(tx, {
        actorStaffId: input.staffId,
        branchId: input.branchId,
        action: "PASSWORD_CHANGED",
        entityType: "STAFF",
        entityId: input.staffId,
        result: "SUCCESS",
        occurredAt: input.passwordChangedAt,
        ipFingerprint: input.newSession.ipFingerprint,
        userAgentCategory: input.newSession.userAgentCategory,
      });
    });
  }
}

export const authRepository: AuthRepository = new DrizzleAuthRepository();
