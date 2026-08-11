import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AuthRepository,
  ChangePasswordSessionInput,
  CreateSessionInput,
  LoginAuditInput,
  LoginStaff,
  RateLimitCheck,
  RateLimitScope,
  RevokeSessionInput,
} from "@/lib/auth/auth-repository";
import { createAuthService } from "@/lib/auth/auth-service";
import * as passwordModule from "@/lib/auth/password";
import { hashPassword } from "@/lib/auth/password";
import {
  ACCOUNT_POLICY,
  evaluateRateLimit,
  IP_POLICY,
  type RateLimitDecision,
  type RateLimitState,
} from "@/lib/auth/rate-limit-core";
import { createAuthSubjectFingerprint } from "@/lib/auth/request-security";

vi.mock("@/lib/auth/password", { spy: true });

const NOW = new Date("2026-08-10T04:00:00.000Z");
const REQUEST_WITH_IP = {
  ipFingerprint: "a".repeat(64),
  userAgentCategory: "DESKTOP" as const,
};
const REQUEST_WITHOUT_IP = {
  ipFingerprint: null,
  userAgentCategory: "UNKNOWN" as const,
};

class FakeAuthRepository implements AuthRepository {
  staff: LoginStaff | null = null;
  checkedScopes: RateLimitScope[] = [];
  failedScopes: RateLimitScope[] = [];
  failedSubjects: string[] = [];
  finalizedAccountSubjects: string[] = [];
  createdSessions: CreateSessionInput[] = [];
  audits: Array<{
    action: "LOGIN_FAILED" | "LOGIN_RATE_LIMITED" | "LOGIN_SUCCESS" | "LOGOUT_SUCCESS";
    result: "SUCCESS" | "DENIED" | "FAILED";
    actorStaffId: number | null;
    branchId: number | null;
  }> = [];
  failLoginAudit = false;
  failSessionFinalization = false;
  maxConcurrentFailureCalls = 0;

  private limits = new Map<string, RateLimitState>();
  private revokedTokenHashes = new Set<string>();
  private mutationQueue: Promise<void> = Promise.resolve();
  private activeFailureCalls = 0;

  async findLoginStaff(staffCode: string): Promise<LoginStaff | null> {
    return staffCode === "OWNER001" ? this.staff : null;
  }

  async checkLimit(
    scope: RateLimitScope,
    subjectHash: string,
    now: Date,
  ): Promise<RateLimitCheck> {
    this.checkedScopes.push(scope);
    const state = this.limits.get(this.key(scope, subjectHash));
    const lockedUntil = state?.lockedUntil ?? null;
    const blocked = Boolean(lockedUntil && lockedUntil.getTime() > now.getTime());

    return {
      blocked,
      lockedUntil,
      retryAfterSeconds: blocked
        ? Math.ceil((lockedUntil!.getTime() - now.getTime()) / 1_000)
        : 0,
    };
  }

  async consumeFailure(
    scope: RateLimitScope,
    subjectHash: string,
    now: Date,
  ): Promise<RateLimitDecision> {
    this.activeFailureCalls += 1;
    this.maxConcurrentFailureCalls = Math.max(
      this.maxConcurrentFailureCalls,
      this.activeFailureCalls,
    );
    const operation = this.mutationQueue.then(() => {
      this.failedScopes.push(scope);
      this.failedSubjects.push(subjectHash);
      const key = this.key(scope, subjectHash);
      const state = this.limits.get(key) ?? {
        attempts: 0,
        windowStartedAt: now,
        lockedUntil: null,
      };
      const decision = evaluateRateLimit(
        state,
        scope === "ACCOUNT" ? ACCOUNT_POLICY : IP_POLICY,
        now,
      );
      this.limits.set(key, decision);
      return decision;
    });

    this.mutationQueue = operation.then(() => undefined, () => undefined);
    try {
      return await operation;
    } finally {
      this.activeFailureCalls -= 1;
    }
  }

  async writeLoginAudit(input: LoginAuditInput): Promise<void> {
    if (this.failLoginAudit) throw new Error("audit unavailable");
    this.audits.push(input);
  }

  async createSessionAndAudit(input: CreateSessionInput): Promise<void> {
    const accountSubjectHash = input.accountSubjectHash;
    this.finalizedAccountSubjects.push(accountSubjectHash);
    const limitsBefore = new Map(this.limits);
    const sessionsBefore = [...this.createdSessions];
    const auditsBefore = [...this.audits];

    try {
      this.limits.delete(this.key("ACCOUNT", accountSubjectHash));
      this.createdSessions.push(input);
      if (this.failSessionFinalization) {
        throw new Error("session audit unavailable");
      }
      this.audits.push({
        action: "LOGIN_SUCCESS",
        result: "SUCCESS",
        actorStaffId: input.staffId,
        branchId: input.branchId,
      });
    } catch (error) {
      this.limits = limitsBefore;
      this.createdSessions = sessionsBefore;
      this.audits = auditsBefore;
      throw error;
    }
  }

  async revokeSessionAndAudit(input: RevokeSessionInput): Promise<void> {
    const session = this.createdSessions.find(
      (candidate) => candidate.sessionTokenHash === input.sessionTokenHash,
    );
    if (!session || this.revokedTokenHashes.has(input.sessionTokenHash)) return;

    this.revokedTokenHashes.add(input.sessionTokenHash);
    this.audits.push({
      action: "LOGOUT_SUCCESS",
      result: "SUCCESS",
      actorStaffId: session.staffId,
      branchId: session.branchId,
    });
  }

  async changePasswordAndRotateSession(
    input: ChangePasswordSessionInput,
  ): Promise<void> {
    void input;
    throw new Error("Not used by login/logout tests");
  }

  setLimit(scope: RateLimitScope, subjectHash: string, state: RateLimitState) {
    this.limits.set(this.key(scope, subjectHash), state);
  }

  getLimit(scope: RateLimitScope, subjectHash: string) {
    return this.limits.get(this.key(scope, subjectHash));
  }

  isRevoked(sessionTokenHash: string) {
    return this.revokedTokenHashes.has(sessionTokenHash);
  }

  private key(scope: RateLimitScope, subjectHash: string) {
    return `${scope}:${subjectHash}`;
  }
}

const originalSessionSecret = process.env.AUTH_SESSION_SECRET;
const originalFingerprintSecret = process.env.AUTH_FINGERPRINT_SECRET;
let passwordHash: string;
let repo: FakeAuthRepository;

describe("auth service", () => {
  beforeAll(async () => {
    process.env.AUTH_SESSION_SECRET = "test-session-secret-that-is-at-least-32-bytes";
    process.env.AUTH_FINGERPRINT_SECRET =
      "test-fingerprint-secret-that-is-at-least-32-bytes";
    passwordHash = await hashPassword("ValidPass#2026");
  });

  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = "test-session-secret-that-is-at-least-32-bytes";
    process.env.AUTH_FINGERPRINT_SECRET =
      "test-fingerprint-secret-that-is-at-least-32-bytes";
    vi.clearAllMocks();
    repo = new FakeAuthRepository();
    repo.staff = {
      id: 1,
      homeBranchId: 10,
      role: "OWNER",
      status: "ACTIVE",
      passwordHash,
      mustChangePassword: false,
    };
  });

  afterEach(() => {
    if (originalSessionSecret === undefined) delete process.env.AUTH_SESSION_SECRET;
    else process.env.AUTH_SESSION_SECRET = originalSessionSecret;
    if (originalFingerprintSecret === undefined) delete process.env.AUTH_FINGERPRINT_SECRET;
    else process.env.AUTH_FINGERPRINT_SECRET = originalFingerprintSecret;
  });

  it("returns generic failure, consumes both opaque buckets and audits invalid password", async () => {
    const service = createAuthService(repo, { now: () => NOW });

    await expect(
      service.login(
        { staffCode: "owner001", password: "WrongPass#2026", returnTo: "/" },
        REQUEST_WITH_IP,
      ),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });

    expect(repo.failedScopes).toEqual(["ACCOUNT", "IP"]);
    expect(repo.failedSubjects).not.toContain("OWNER001");
    expect(repo.failedSubjects).not.toContain("owner001");
    expect(repo.audits.at(-1)).toMatchObject({
      action: "LOGIN_FAILED",
      result: "FAILED",
      actorStaffId: 1,
      branchId: 10,
    });
    expect(JSON.stringify(repo.audits)).not.toContain("WrongPass#2026");
  });

  it("consumes ACCOUNT and IP failures sequentially within one request", async () => {
    const service = createAuthService(repo, { now: () => NOW });

    await expect(
      service.login(
        { staffCode: "OWNER001", password: "WrongPass#2026", returnTo: "/" },
        REQUEST_WITH_IP,
      ),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });

    expect(repo.failedScopes).toEqual(["ACCOUNT", "IP"]);
    expect(repo.maxConcurrentFailureCalls).toBe(1);
  });

  it("uses the private dummy verification path and the same generic failure for unknown Staff", async () => {
    const service = createAuthService(repo, { now: () => NOW });
    const knownFailure = service.login(
      { staffCode: "OWNER001", password: "WrongPass#2026", returnTo: "/" },
      REQUEST_WITHOUT_IP,
    );
    await expect(knownFailure).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    const knownMessage = await knownFailure.catch((error: Error) => error.message);
    vi.clearAllMocks();

    const unknownFailure = service.login(
      { staffCode: "UNKNOWN001", password: "WrongPass#2026", returnTo: "/" },
      REQUEST_WITHOUT_IP,
    );
    await expect(unknownFailure).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      status: 401,
    });
    const unknownMessage = await unknownFailure.catch((error: Error) => error.message);

    expect(passwordModule.verifyPasswordOrDummy).toHaveBeenCalledWith(
      null,
      "WrongPass#2026",
    );
    expect(unknownMessage).toBe(knownMessage);
    expect(repo.audits.at(-1)).toMatchObject({
      action: "LOGIN_FAILED",
      actorStaffId: null,
      branchId: null,
    });
    expect(JSON.stringify(repo.audits)).not.toContain("UNKNOWN001");
  });

  it("skips the IP bucket when the request has no trusted IP fingerprint", async () => {
    const service = createAuthService(repo, { now: () => NOW });

    await expect(
      service.login(
        { staffCode: "OWNER001", password: "WrongPass#2026", returnTo: "/" },
        REQUEST_WITHOUT_IP,
      ),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });

    expect(repo.checkedScopes).toEqual(["ACCOUNT"]);
    expect(repo.failedScopes).toEqual(["ACCOUNT"]);
  });

  it("rejects a valid password while the account is locked without creating a session", async () => {
    const service = createAuthService(repo, { now: () => NOW });
    const accountHash = createAuthSubjectFingerprint("OWNER001");
    repo.setLimit("ACCOUNT", accountHash, {
      attempts: 5,
      windowStartedAt: new Date(NOW.getTime() - 60_000),
      lockedUntil: new Date(NOW.getTime() + 15 * 60_000),
    });

    await expect(
      service.login(
        { staffCode: "OWNER001", password: "ValidPass#2026", returnTo: "/" },
        REQUEST_WITHOUT_IP,
      ),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      retryAfterSeconds: 900,
    });

    expect(passwordModule.verifyPasswordOrDummy).not.toHaveBeenCalled();
    expect(repo.createdSessions).toHaveLength(0);
    expect(repo.audits.at(-1)).toMatchObject({
      action: "LOGIN_RATE_LIMITED",
      result: "DENIED",
    });
  });

  it("creates an eight-hour password-change session without incrementing or clearing IP", async () => {
    repo.staff = { ...repo.staff!, mustChangePassword: true };
    const service = createAuthService(repo, { now: () => NOW });
    const accountHash = createAuthSubjectFingerprint("OWNER001");
    repo.setLimit("ACCOUNT", accountHash, {
      attempts: 2,
      windowStartedAt: NOW,
      lockedUntil: null,
    });

    const result = await service.login(
      { staffCode: "OWNER001", password: "ValidPass#2026", returnTo: "/members" },
      REQUEST_WITH_IP,
    );

    expect(result.claims).toMatchObject({
      staffId: 1,
      mode: "PASSWORD_CHANGE_REQUIRED",
      expiresAt: Math.floor(NOW.getTime() / 1_000) + 8 * 60 * 60,
    });
    expect(result.returnTo).toBe("/members");
    expect(result.sessionCookie).toEqual(expect.any(String));
    expect(repo.failedScopes).toEqual([]);
    expect(repo.finalizedAccountSubjects).toEqual([accountHash]);
    expect(repo.getLimit("ACCOUNT", accountHash)).toBeUndefined();
    expect(repo.createdSessions[0]).toMatchObject({
      mode: "PASSWORD_CHANGE_REQUIRED",
      createdAt: NOW,
      lastSeenAt: NOW,
      absoluteExpiresAt: new Date(NOW.getTime() + 8 * 60 * 60_000),
      idleExpiresAt: new Date(NOW.getTime() + 30 * 60_000),
      ipFingerprint: REQUEST_WITH_IP.ipFingerprint,
    });
    expect(repo.audits.at(-1)).toMatchObject({
      action: "LOGIN_SUCCESS",
      result: "SUCCESS",
    });
  });

  it("keeps the account limit and rolls back the session when success audit fails", async () => {
    const service = createAuthService(repo, { now: () => NOW });
    const accountHash = createAuthSubjectFingerprint("OWNER001");
    repo.setLimit("ACCOUNT", accountHash, {
      attempts: 3,
      windowStartedAt: NOW,
      lockedUntil: null,
    });
    repo.failSessionFinalization = true;

    await expect(
      service.login(
        { staffCode: "OWNER001", password: "ValidPass#2026", returnTo: "/" },
        REQUEST_WITHOUT_IP,
      ),
    ).rejects.toThrow("session audit unavailable");

    expect(repo.getLimit("ACCOUNT", accountHash)).toMatchObject({ attempts: 3 });
    expect(repo.createdSessions).toHaveLength(0);
    expect(
      repo.audits.filter((audit) => audit.action === "LOGIN_SUCCESS"),
    ).toHaveLength(0);
  });

  it("serializes concurrent failures so the fifth failure locks the account", async () => {
    const service = createAuthService(repo, { now: () => NOW });
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        service.login(
          { staffCode: "OWNER001", password: "WrongPass#2026", returnTo: "/" },
          REQUEST_WITHOUT_IP,
        ),
      ),
    );
    const codes = attempts.map((attempt) =>
      attempt.status === "rejected" ? attempt.reason.code : "SUCCESS",
    );
    const accountHash = createAuthSubjectFingerprint("OWNER001");

    expect(codes.filter((code) => code === "INVALID_CREDENTIALS")).toHaveLength(4);
    expect(codes.filter((code) => code === "RATE_LIMITED")).toHaveLength(1);
    expect(repo.getLimit("ACCOUNT", accountHash)).toMatchObject({
      attempts: 5,
      blocked: true,
    });
  });

  it("fails closed with a generic unavailable error when failure audit cannot be written", async () => {
    repo.failLoginAudit = true;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const service = createAuthService(repo, { now: () => NOW });

    await expect(
      service.login(
        { staffCode: "UNKNOWN001", password: "WrongPass#2026", returnTo: "/" },
        REQUEST_WITHOUT_IP,
      ),
    ).rejects.toMatchObject({ code: "AUTH_UNAVAILABLE", status: 503 });

    expect(consoleError).toHaveBeenCalledWith(
      "Authentication audit unavailable",
      "Error",
    );
    consoleError.mockRestore();
  });

  it("revokes and audits logout idempotently", async () => {
    const service = createAuthService(repo, { now: () => NOW });
    const loginResult = await service.login(
      { staffCode: "OWNER001", password: "ValidPass#2026", returnTo: "/" },
      REQUEST_WITHOUT_IP,
    );
    const session = repo.createdSessions[0];

    await service.logout(loginResult.sessionCookie, REQUEST_WITHOUT_IP);
    await service.logout(loginResult.sessionCookie, REQUEST_WITHOUT_IP);
    await service.logout(undefined, REQUEST_WITHOUT_IP);

    expect(repo.isRevoked(session.sessionTokenHash)).toBe(true);
    expect(
      repo.audits.filter((audit) => audit.action === "LOGOUT_SUCCESS"),
    ).toHaveLength(1);
  });
});
