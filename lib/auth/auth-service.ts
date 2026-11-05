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
import {
  hashPassword,
  validatePassword,
  verifyPasswordOrDummy,
} from "@/lib/auth/password";
import {
  createAuthSubjectFingerprint,
  getSafeReturnPath,
} from "@/lib/auth/request-security";
import {
  createSessionId,
  hashSessionId,
  normalizeSessionTimestamp,
  signSessionClaims,
  verifySessionClaims,
} from "@/lib/auth/session-token";
import type {
  RequestFingerprintInput,
  SessionClaims,
  SessionMode,
} from "@/lib/auth/types";
import type { AuthenticatedStaff } from "@/lib/auth/session-service";
import { decryptTotpSecret, hashRecoveryCode, verifyTotp } from "@/lib/totp";

export type LoginInput = {
  staffCode: string;
  password: string;
  returnTo?: string | null;
  totpCode?: string | null;
};

export type AuthRequestContext = RequestFingerprintInput;

export type LoginResult = {
  sessionCookie: string;
  claims: SessionClaims;
  returnTo: string;
};

export type ChangePasswordResult = {
  sessionCookie: string;
  claims: SessionClaims;
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
  const accountDecision = await repository.consumeFailure(
    "ACCOUNT",
    accountSubjectHash,
    now,
  );
  if (request.ipFingerprint) {
    const ipDecision = await repository.consumeFailure(
      "IP",
      request.ipFingerprint,
      now,
    );
    return accountDecision.blocked || ipDecision.blocked;
  }
  return accountDecision.blocked;
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
    let secondFactorValid = loginStaff?.totpStatus !== "ENABLED";
    if (
      loginStaff?.totpStatus === "ENABLED" &&
      loginStaff.passwordHash &&
      passwordMatches &&
      input.totpCode
    ) {
      if (/^\d{6}$/.test(input.totpCode)) {
        if (!loginStaff.encryptedTotpSecret || !repository.claimTotpStep)
          throw new AuthError("AUTH_UNAVAILABLE", 503, AUTH_UNAVAILABLE_MESSAGE);
        const secret = decryptTotpSecret(loginStaff.encryptedTotpSecret, process.env.AUTH_TOTP_ENCRYPTION_KEY ?? "");
        const verified = verifyTotp(secret, input.totpCode, Math.floor(occurredAt.getTime() / 1000), loginStaff.lastUsedTotpStep ?? null);
        secondFactorValid = Boolean(verified.valid && verified.step !== null && (await repository.claimTotpStep(loginStaff.id, verified.step)));
      } else if (repository.consumeTotpRecoveryCode) {
        secondFactorValid = await repository.consumeTotpRecoveryCode(loginStaff.id, hashRecoveryCode(input.totpCode), occurredAt);
      }
    }
    const credentialsValid = Boolean(
      loginStaff &&
        loginStaff.status === "ACTIVE" &&
        loginStaff.passwordHash &&
        passwordMatches &&
        secondFactorValid,
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
    const sessionStartedAt = normalizeSessionTimestamp(occurredAt);
    const absoluteExpiresAt = new Date(
      sessionStartedAt.getTime() + SESSION_ABSOLUTE_LIFETIME_SECONDS * 1_000,
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

    await repository.createSessionAndAudit({
      accountSubjectHash,
      staffId: loginStaff.id,
      branchId: loginStaff.homeBranchId,
      sessionTokenHash: hashSessionId(sessionId),
      mode,
      createdAt: sessionStartedAt,
      lastSeenAt: sessionStartedAt,
      absoluteExpiresAt,
      idleExpiresAt: new Date(
        sessionStartedAt.getTime() + SESSION_IDLE_TIMEOUT_SECONDS * 1_000,
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

  /** เปลี่ยนรหัสผ่านเฉพาะ forced session แล้วให้ repository หมุน session และ audit แบบ atomic โดยไม่ส่ง plaintext ลง storage */
  async function changeOwnPassword(
    session: AuthenticatedStaff,
    password: string,
    request: AuthRequestContext,
  ): Promise<ChangePasswordResult> {
    if (session.mode !== "PASSWORD_CHANGE_REQUIRED") {
      throw new AuthError(
        "PASSWORD_CHANGE_NOT_REQUIRED",
        403,
        "เซสชันนี้ไม่ต้องเปลี่ยนรหัสผ่าน",
      );
    }
    if (!validatePassword(password).valid) {
      throw new AuthError(
        "INVALID_PASSWORD",
        400,
        "รหัสผ่านไม่เป็นไปตามนโยบาย",
      );
    }

    const occurredAt = now();
    const passwordHash = await hashPassword(password);
    const sessionId = createSessionId();
    const sessionStartedAt = normalizeSessionTimestamp(occurredAt);
    const absoluteExpiresAt = new Date(
      sessionStartedAt.getTime() + SESSION_ABSOLUTE_LIFETIME_SECONDS * 1_000,
    );
    const claims: SessionClaims = {
      sessionId,
      staffId: session.staffId,
      role: session.role,
      homeBranchId: session.homeBranchId,
      mode: "FULL",
      expiresAt: Math.floor(absoluteExpiresAt.getTime() / 1_000),
    };
    const sessionCookie = await signSessionClaims(claims);

    await repository.changePasswordAndRotateSession({
      currentAuthSessionId: session.authSessionId,
      staffId: session.staffId,
      branchId: session.homeBranchId,
      passwordHash,
      passwordChangedAt: occurredAt,
      newSession: {
        sessionTokenHash: hashSessionId(sessionId),
        mode: "FULL",
        createdAt: sessionStartedAt,
        lastSeenAt: sessionStartedAt,
        absoluteExpiresAt,
        idleExpiresAt: new Date(
          sessionStartedAt.getTime() + SESSION_IDLE_TIMEOUT_SECONDS * 1_000,
        ),
        ...request,
      },
    });

    return { sessionCookie, claims };
  }

  return { login, logout, changeOwnPassword };
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

/** เปลี่ยนรหัสผ่านด้วย repository production และคืน signed FULL session ใหม่เมื่อ transaction สำเร็จแล้วเท่านั้น */
export async function changeOwnPassword(
  session: AuthenticatedStaff,
  password: string,
  request: AuthRequestContext,
): Promise<ChangePasswordResult> {
  const { authRepository } = await import("@/lib/auth/auth-repository");
  return createAuthService(authRepository).changeOwnPassword(
    session,
    password,
    request,
  );
}
