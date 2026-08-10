import "server-only";

import {
  LOGIN_LIMIT_LOCK_SECONDS,
  SESSION_ABSOLUTE_LIFETIME_SECONDS,
  SESSION_IDLE_TIMEOUT_SECONDS,
} from "@/lib/auth/constants";
import { AuthError } from "@/lib/auth/auth-errors";
import type {
  AuthRepository,
  LoginAuditInput,
  LoginStaff,
  RateLimitCheck,
} from "@/lib/auth/auth-repository";
import { verifyPasswordOrDummy } from "@/lib/auth/password";
import {
  createAuthSubjectFingerprint,
  getSafeReturnPath,
} from "@/lib/auth/request-security";
import {
  createSessionId,
  hashSessionId,
  signSessionClaims,
  verifySessionClaims,
} from "@/lib/auth/session-token";
import type {
  RequestFingerprintInput,
  SessionClaims,
  SessionMode,
} from "@/lib/auth/types";

export type LoginInput = {
  staffCode: string;
  password: string;
  returnTo?: string | null;
};

export type AuthRequestContext = RequestFingerprintInput;

export type LoginResult = {
  sessionCookie: string;
  claims: SessionClaims;
  returnTo: string;
};

type AuthServiceDependencies = {
  now: () => Date;
};

const INVALID_CREDENTIALS_MESSAGE =
  "รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง";
const RATE_LIMITED_MESSAGE =
  "ไม่สามารถเข้าสู่ระบบได้ชั่วคราว กรุณาลองใหม่ภายหลัง";
const AUTH_UNAVAILABLE_MESSAGE =
  "ไม่สามารถให้บริการยืนยันตัวตนได้ชั่วคราว";

/** คืน identity จริงเมื่อพบ Staff และใช้ null เฉพาะเหตุการณ์ที่ยังระบุตัวตนไม่ได้ */
function getAuditIdentity(staff: LoginStaff | null) {
  return staff
    ? { actorStaffId: staff.id, branchId: staff.homeBranchId }
    : { actorStaffId: null, branchId: null };
}

/** ตรวจ ACCOUNT ก่อนและตรวจ IP เพิ่มเฉพาะเมื่อ trusted proxy สร้าง fingerprint มาแล้ว */
async function checkLoginLimits(
  repository: AuthRepository,
  accountSubjectHash: string,
  request: AuthRequestContext,
  now: Date,
): Promise<RateLimitCheck[]> {
  const checks: Array<Promise<RateLimitCheck>> = [
    repository.checkLimit("ACCOUNT", accountSubjectHash, now),
  ];
  if (request.ipFingerprint) {
    checks.push(repository.checkLimit("IP", request.ipFingerprint, now));
  }
  return Promise.all(checks);
}

/** เพิ่มเฉพาะ failure bucket ที่เชื่อถือได้ และคืนว่ามี bucket ใดเพิ่งถึงหรือยังติด threshold หรือไม่ */
async function consumeLoginFailures(
  repository: AuthRepository,
  accountSubjectHash: string,
  request: AuthRequestContext,
  now: Date,
) {
  const failures: Array<Promise<{ blocked: boolean }>> = [
    repository.consumeFailure("ACCOUNT", accountSubjectHash, now),
  ];
  if (request.ipFingerprint) {
    failures.push(
      repository.consumeFailure("IP", request.ipFingerprint, now),
    );
  }
  const decisions = await Promise.all(failures);
  return decisions.some((decision) => decision.blocked);
}

/** เขียน audit ก่อนคืน credential/rate-limit error และแปลง audit failure เป็นข้อความกลางแบบ fail closed */
async function writeFailureAudit(
  repository: AuthRepository,
  input: LoginAuditInput,
): Promise<void> {
  try {
    await repository.writeLoginAudit(input);
  } catch (error) {
    console.error(
      "Authentication audit unavailable",
      error instanceof Error ? error.name : "UNKNOWN_ERROR",
    );
    throw new AuthError(
      "AUTH_UNAVAILABLE",
      503,
      AUTH_UNAVAILABLE_MESSAGE,
    );
  }
}

/** สร้าง Login/Logout orchestration จาก repository ที่กำหนด เพื่อทดสอบ transaction contract โดยไม่เชื่อมฐานข้อมูลจริง */
export function createAuthService(
  repository: AuthRepository,
  dependencies: Partial<AuthServiceDependencies> = {},
) {
  const now = dependencies.now ?? (() => new Date());

  /** ตรวจ lock/credential, บันทึก failure แบบคงทน และสร้าง signed database session เมื่อสำเร็จ */
  async function login(
    input: LoginInput,
    request: AuthRequestContext,
  ): Promise<LoginResult> {
    const occurredAt = now();
    const normalizedStaffCode = input.staffCode.trim().toUpperCase();
    const accountSubjectHash =
      createAuthSubjectFingerprint(normalizedStaffCode);
    const loginStaff = await repository.findLoginStaff(normalizedStaffCode);
    const identity = getAuditIdentity(loginStaff);
    const checks = await checkLoginLimits(
      repository,
      accountSubjectHash,
      request,
      occurredAt,
    );

    if (checks.some((check) => check.blocked)) {
      await writeFailureAudit(repository, {
        ...identity,
        ...request,
        action: "LOGIN_RATE_LIMITED",
        result: "DENIED",
        reasonCode: "RATE_LIMITED",
        occurredAt,
      });
      throw new AuthError(
        "RATE_LIMITED",
        429,
        RATE_LIMITED_MESSAGE,
        LOGIN_LIMIT_LOCK_SECONDS,
      );
    }

    const passwordMatches = await verifyPasswordOrDummy(
      loginStaff?.passwordHash ?? null,
      input.password,
    );
    const credentialsValid = Boolean(
      loginStaff &&
        loginStaff.status === "ACTIVE" &&
        loginStaff.passwordHash &&
        passwordMatches,
    );

    if (!credentialsValid || !loginStaff) {
      const blocked = await consumeLoginFailures(
        repository,
        accountSubjectHash,
        request,
        occurredAt,
      );
      await writeFailureAudit(repository, {
        ...identity,
        ...request,
        action: blocked ? "LOGIN_RATE_LIMITED" : "LOGIN_FAILED",
        result: blocked ? "DENIED" : "FAILED",
        reasonCode: blocked ? "RATE_LIMITED" : "INVALID_CREDENTIALS",
        occurredAt,
      });

      if (blocked) {
        throw new AuthError(
          "RATE_LIMITED",
          429,
          RATE_LIMITED_MESSAGE,
          LOGIN_LIMIT_LOCK_SECONDS,
        );
      }
      throw new AuthError(
        "INVALID_CREDENTIALS",
        401,
        INVALID_CREDENTIALS_MESSAGE,
      );
    }

    const mode: SessionMode = loginStaff.mustChangePassword
      ? "PASSWORD_CHANGE_REQUIRED"
      : "FULL";
    const sessionId = createSessionId();
    const absoluteExpiresAt = new Date(
      occurredAt.getTime() + SESSION_ABSOLUTE_LIFETIME_SECONDS * 1_000,
    );
    const claims: SessionClaims = {
      sessionId,
      staffId: loginStaff.id,
      role: loginStaff.role,
      homeBranchId: loginStaff.homeBranchId,
      mode,
      expiresAt: Math.floor(absoluteExpiresAt.getTime() / 1_000),
    };
    const sessionCookie = await signSessionClaims(claims);

    await repository.clearAccountLimit(accountSubjectHash);
    await repository.createSessionAndAudit({
      staffId: loginStaff.id,
      branchId: loginStaff.homeBranchId,
      sessionTokenHash: hashSessionId(sessionId),
      mode,
      createdAt: occurredAt,
      lastSeenAt: occurredAt,
      absoluteExpiresAt,
      idleExpiresAt: new Date(
        occurredAt.getTime() + SESSION_IDLE_TIMEOUT_SECONDS * 1_000,
      ),
      ...request,
    });

    return {
      sessionCookie,
      claims,
      returnTo: getSafeReturnPath(input.returnTo),
    };
  }

  /** ตรวจลายเซ็นก่อนส่ง token hash ให้ repository revoke; cookie ว่าง/เสียหรือ session เดิมถูก revoke แล้วสำเร็จแบบ idempotent */
  async function logout(
    sessionCookie: string | undefined,
    request: AuthRequestContext,
  ): Promise<void> {
    if (!sessionCookie) return;
    const claims = await verifySessionClaims(sessionCookie);
    if (!claims) return;

    await repository.revokeSessionAndAudit({
      sessionTokenHash: hashSessionId(claims.sessionId),
      revokedAt: now(),
      ...request,
    });
  }

  return { login, logout };
}

/** ใช้ repository production แบบ lazy เพื่อให้ unit tests โหลด orchestration โดยไม่เปิด database connection */
export async function login(
  input: LoginInput,
  request: AuthRequestContext,
): Promise<LoginResult> {
  const { authRepository } = await import("@/lib/auth/auth-repository");
  return createAuthService(authRepository).login(input, request);
}

/** ใช้ repository production แบบ lazy และรอ revoke/audit เสร็จก่อนให้ route ลบ cookie */
export async function logout(
  sessionCookie: string | undefined,
  request: AuthRequestContext,
): Promise<void> {
  const { authRepository } = await import("@/lib/auth/auth-repository");
  return createAuthService(authRepository).logout(sessionCookie, request);
}
