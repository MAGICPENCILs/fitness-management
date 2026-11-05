import "server-only";

import { cache } from "react";
import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/db";
import { auditLogs, authSessions, branches, staff } from "@/db/schema";
import {
  AUTH_COOKIE_NAME,
  SESSION_IDLE_TIMEOUT_SECONDS,
  SESSION_TOUCH_INTERVAL_SECONDS,
} from "@/lib/auth/constants";
import {
  hashSessionId,
  verifySessionClaims,
} from "@/lib/auth/session-token";
import type { SessionClaims, SessionMode } from "@/lib/auth/types";
import type { StaffRole } from "@/lib/rbac";

type ActiveStatus = "ACTIVE" | "INACTIVE";
type SessionFailureReason =
  | "MISSING"
  | "REVOKED"
  | "EXPIRED"
  | "INACTIVE_STAFF"
  | "INACTIVE_BRANCH"
  | "PASSWORD_CHANGE_REQUIRED";

export type StoredSessionRow = {
  authSessionId: number;
  sessionTokenHash: string;
  staffId: number;
  staffCode: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
  homeBranchId: number;
  branchName: string;
  staffStatus: ActiveStatus;
  branchStatus: ActiveStatus;
  mode: SessionMode;
  revokedAt: Date | null;
  absoluteExpiresAt: Date;
  idleExpiresAt: Date;
  lastSeenAt: Date;
};

export type AuthenticatedStaff = {
  authSessionId: number;
  staffId: number;
  staffCode: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
  homeBranchId: number;
  branchName: string;
  mode: SessionMode;
};

export type TouchSessionInput = {
  authSessionId: number;
  lastSeenAt: Date;
  idleExpiresAt: Date;
};

export type ExpireSessionInput = {
  authSessionId: number;
  staffId: number;
  branchId: number;
  occurredAt: Date;
};

export interface SessionRepository {
  findByTokenHash(tokenHash: string): Promise<StoredSessionRow | null>;
  touchSession(input: TouchSessionInput): Promise<void>;
  expireSessionAndAudit(input: ExpireSessionInput): Promise<void>;
}

type SessionServiceDependencies = {
  readSessionCookie(): Promise<string | undefined>;
  verifyClaims(cookie: string): Promise<SessionClaims | null>;
  hashSessionId(sessionId: string): string;
  repository: SessionRepository;
  now(): Date;
};

/** บันทึกเฉพาะเหตุที่ authoritative session ผ่านหรือไม่ผ่านใน development โดยไม่เผย token, hash หรือ identity */
function logAuthDiagnostic(status: string): void {
  if (process.env.NODE_ENV === "development") {
    console.info("[auth-diagnostic]", status);
  }
}

export class SessionAuthenticationError extends Error {
  /** เก็บ reason ภายในเพื่อให้ DAL ทำ side effect ที่ถูกต้อง โดยไม่ส่งรายละเอียด security state ไปยังผู้ใช้ */
  constructor(
    message: string,
    public status: 401 | 403,
    public reason: SessionFailureReason,
  ) {
    super(message);
    this.name = "SessionAuthenticationError";
  }
}

/** ตรวจ lifecycle และสถานะ Staff/สาขาจากฐานข้อมูลก่อนสร้าง DTO ที่ปลอดภัยสำหรับ authorization */
export function validateStoredSession(
  row: StoredSessionRow,
  now: Date,
): AuthenticatedStaff {
  if (row.revokedAt) {
    throw new SessionAuthenticationError(
      "เซสชันไม่สามารถใช้งานได้",
      401,
      "REVOKED",
    );
  }
  if (
    row.absoluteExpiresAt.getTime() <= now.getTime() ||
    row.idleExpiresAt.getTime() <= now.getTime()
  ) {
    throw new SessionAuthenticationError(
      "เซสชันหมดอายุแล้ว",
      401,
      "EXPIRED",
    );
  }
  if (row.staffStatus !== "ACTIVE") {
    throw new SessionAuthenticationError(
      "บัญชีพนักงานไม่สามารถใช้งานได้",
      401,
      "INACTIVE_STAFF",
    );
  }
  if (row.branchStatus !== "ACTIVE") {
    throw new SessionAuthenticationError(
      "สาขาของบัญชีไม่สามารถใช้งานได้",
      401,
      "INACTIVE_BRANCH",
    );
  }

  return {
    authSessionId: row.authSessionId,
    staffId: row.staffId,
    staffCode: row.staffCode,
    firstName: row.firstName,
    lastName: row.lastName,
    role: row.role,
    homeBranchId: row.homeBranchId,
    branchName: row.branchName,
    mode: row.mode,
  };
}

/** จำกัดการเขียน activity ไม่เกินหนึ่งครั้งต่อ 5 นาที และถือค่าที่ครบ boundary ว่าพร้อม touch */
export function shouldTouchSession(lastSeenAt: Date, now: Date): boolean {
  return (
    now.getTime() - lastSeenAt.getTime() >=
    SESSION_TOUCH_INTERVAL_SECONDS * 1_000
  );
}

/** เทียบ claims ทุกค่าที่มีผลต่อสิทธิ์กับฐานข้อมูล เพื่อให้ role/branch/mode เก่าใช้ต่อไม่ได้ */
function claimsMatchStoredSession(
  claims: SessionClaims,
  row: StoredSessionRow,
): boolean {
  return (
    claims.staffId === row.staffId &&
    claims.role === row.role &&
    claims.homeBranchId === row.homeBranchId &&
    claims.mode === row.mode &&
    claims.expiresAt ===
      Math.floor(row.absoluteExpiresAt.getTime() / 1_000)
  );
}

/** บังคับ mode หลังผ่าน authoritative validation แล้ว เพื่อแยก forced-password-change ออกจากสิทธิ์แอปเต็มรูปแบบ */
function requireLoadedSession(
  session: AuthenticatedStaff | null,
  options: { allowPasswordChange: boolean },
): AuthenticatedStaff {
  if (!session) {
    throw new SessionAuthenticationError(
      "กรุณาเข้าสู่ระบบ",
      401,
      "MISSING",
    );
  }
  if (!options.allowPasswordChange && session.mode !== "FULL") {
    throw new SessionAuthenticationError(
      "กรุณาเปลี่ยนรหัสผ่านก่อนใช้งานระบบ",
      403,
      "PASSWORD_CHANGE_REQUIRED",
    );
  }
  return session;
}

/** สร้าง authoritative session service ที่ทดสอบ repository boundary ได้โดยไม่ผูกกับ request หรือ MySQL จริง */
export function createSessionService(dependencies: SessionServiceDependencies) {
  /** อ่าน signed cookie แล้วตรวจ row, claims และ lifecycle ก่อนคืน Staff; invalid state ทุกแบบ fail closed */
  async function getOptionalSession(): Promise<AuthenticatedStaff | null> {
    const cookie = await dependencies.readSessionCookie();
    if (!cookie) {
      logAuthDiagnostic("DAL_COOKIE_MISSING");
      return null;
    }

    const claims = await dependencies.verifyClaims(cookie);
    if (!claims) {
      logAuthDiagnostic("DAL_CLAIMS_INVALID");
      return null;
    }

    const tokenHash = dependencies.hashSessionId(claims.sessionId);
    const row = await dependencies.repository.findByTokenHash(tokenHash);
    if (!row || row.sessionTokenHash !== tokenHash) {
      logAuthDiagnostic("DAL_SESSION_ROW_MISSING");
      return null;
    }

    const now = dependencies.now();
    let authenticatedStaff: AuthenticatedStaff;
    try {
      authenticatedStaff = validateStoredSession(row, now);
    } catch (error) {
      if (
        error instanceof SessionAuthenticationError &&
        error.reason === "EXPIRED"
      ) {
        await dependencies.repository.expireSessionAndAudit({
          authSessionId: row.authSessionId,
          staffId: row.staffId,
          branchId: row.homeBranchId,
          occurredAt: now,
        });
      }
      logAuthDiagnostic(
        error instanceof SessionAuthenticationError
          ? `DAL_SESSION_${error.reason}`
          : "DAL_SESSION_INVALID",
      );
      return null;
    }

    if (!claimsMatchStoredSession(claims, row)) {
      logAuthDiagnostic("DAL_CLAIMS_MISMATCH");
      return null;
    }

    if (shouldTouchSession(row.lastSeenAt, now)) {
      await dependencies.repository.touchSession({
        authSessionId: row.authSessionId,
        lastSeenAt: now,
        idleExpiresAt: new Date(
          Math.min(
            now.getTime() + SESSION_IDLE_TIMEOUT_SECONDS * 1_000,
            row.absoluteExpiresAt.getTime(),
          ),
        ),
      });
    }

    logAuthDiagnostic("DAL_SESSION_OK");
    return authenticatedStaff;
  }

  /** ต้องมี authoritative session และเลือกได้ว่าจะอนุญาต forced-password-change mode หรือไม่ */
  async function requireSession(options: {
    allowPasswordChange: boolean;
  }): Promise<AuthenticatedStaff> {
    return requireLoadedSession(await getOptionalSession(), options);
  }

  /** ใช้กับข้อมูลและคำสั่งของแอปที่อนุญาตเฉพาะ session mode FULL */
  async function requireFullSession(): Promise<AuthenticatedStaff> {
    return requireSession({ allowPasswordChange: false });
  }

  return { getOptionalSession, requireSession, requireFullSession };
}

class DrizzleSessionRepository implements SessionRepository {
  /** โหลด session พร้อม Staff และสาขาใน query เดียว แต่คง status ไว้ให้ validator ตัดสินแบบ fail closed */
  async findByTokenHash(tokenHash: string): Promise<StoredSessionRow | null> {
    const [row] = await db
      .select({
        authSessionId: authSessions.id,
        sessionTokenHash: authSessions.sessionTokenHash,
        staffId: staff.id,
        staffCode: staff.staffCode,
        firstName: staff.firstName,
        lastName: staff.lastName,
        role: staff.role,
        homeBranchId: staff.homeBranchId,
        branchName: branches.name,
        staffStatus: staff.status,
        branchStatus: branches.status,
        mode: authSessions.mode,
        revokedAt: authSessions.revokedAt,
        absoluteExpiresAt: authSessions.absoluteExpiresAt,
        idleExpiresAt: authSessions.idleExpiresAt,
        lastSeenAt: authSessions.lastSeenAt,
      })
      .from(authSessions)
      .innerJoin(staff, eq(authSessions.staffId, staff.id))
      .innerJoin(branches, eq(staff.homeBranchId, branches.id))
      .where(eq(authSessions.sessionTokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  }

  /** เลื่อน idle expiry เฉพาะ row ที่ยัง active ณ เวลา UPDATE ของฐานข้อมูล เพื่อไม่ให้ request ที่ล่าช้าชุบ session ที่หมดอายุแล้ว */
  async touchSession(input: TouchSessionInput): Promise<void> {
    const touchCutoff = new Date(
      input.lastSeenAt.getTime() - SESSION_TOUCH_INTERVAL_SECONDS * 1_000,
    );
    await db
      .update(authSessions)
      .set({
        lastSeenAt: input.lastSeenAt,
        idleExpiresAt: input.idleExpiresAt,
      })
      .where(
        and(
          eq(authSessions.id, input.authSessionId),
          isNull(authSessions.revokedAt),
          gt(authSessions.absoluteExpiresAt, sql`CURRENT_TIMESTAMP`),
          gt(authSessions.idleExpiresAt, sql`CURRENT_TIMESTAMP`),
          lte(authSessions.lastSeenAt, touchCutoff),
        ),
      );
  }

  /** ใช้ expiry CAS ก่อน mark/audit เพื่อไม่ revoke row ที่ concurrent touch ต่ออายุสำเร็จ และให้ audit มีเพียง request แรก */
  async expireSessionAndAudit(input: ExpireSessionInput): Promise<void> {
    await db.transaction(async (tx) => {
      const result = await tx
        .update(authSessions)
        .set({ revokedAt: input.occurredAt, revokedReason: "EXPIRED" })
        .where(
          and(
            eq(authSessions.id, input.authSessionId),
            isNull(authSessions.revokedAt),
            or(
              lte(authSessions.absoluteExpiresAt, input.occurredAt),
              lte(authSessions.idleExpiresAt, input.occurredAt),
            ),
          ),
        );
      if (result[0].affectedRows === 0) return;

      await tx.insert(auditLogs).values({
        actorStaffId: input.staffId,
        branchId: input.branchId,
        action: "SESSION_EXPIRED",
        entityType: "AUTH_SESSION",
        entityId: input.authSessionId,
        result: "SUCCESS",
        createdAt: input.occurredAt,
      });
    });
  }
}

const defaultSessionService = createSessionService({
  readSessionCookie: async () =>
    (await cookies()).get(AUTH_COOKIE_NAME)?.value,
  verifyClaims: verifySessionClaims,
  hashSessionId,
  repository: new DrizzleSessionRepository(),
  now: () => new Date(),
});

/** memoize authoritative read ภายใน React render pass เพื่อลด query ซ้ำจาก layout และ service ที่ใช้ session เดียวกัน */
export const getOptionalSession = cache(
  async (): Promise<AuthenticatedStaff | null> =>
    defaultSessionService.getOptionalSession(),
);

/** guard กลางสำหรับ flow ที่ระบุชัดว่าจะยอม PASSWORD_CHANGE_REQUIRED หรือไม่ */
export async function requireSession(options: {
  allowPasswordChange: boolean;
}): Promise<AuthenticatedStaff> {
  return requireLoadedSession(await getOptionalSession(), options);
}

/** guard หลักของ application data ที่ยอมเฉพาะ session mode FULL */
export async function requireFullSession(): Promise<AuthenticatedStaff> {
  return requireSession({ allowPasswordChange: false });
}
