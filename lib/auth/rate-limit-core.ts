import {
  ACCOUNT_LOGIN_LIMIT,
  IP_LOGIN_LIMIT,
  LOGIN_LIMIT_LOCK_SECONDS,
  LOGIN_LIMIT_WINDOW_SECONDS,
} from "@/lib/auth/constants";

export type RateLimitState = {
  attempts: number;
  windowStartedAt: Date;
  lockedUntil: Date | null;
};

export type RateLimitPolicy = {
  maxAttempts: number;
  windowMs: number;
  lockMs: number;
};

export type RateLimitDecision = RateLimitState & {
  blocked: boolean;
};

export const ACCOUNT_POLICY: Readonly<RateLimitPolicy> = {
  maxAttempts: ACCOUNT_LOGIN_LIMIT,
  windowMs: LOGIN_LIMIT_WINDOW_SECONDS * 1_000,
  lockMs: LOGIN_LIMIT_LOCK_SECONDS * 1_000,
};

export const IP_POLICY: Readonly<RateLimitPolicy> = {
  maxAttempts: IP_LOGIN_LIMIT,
  windowMs: LOGIN_LIMIT_WINDOW_SECONDS * 1_000,
  lockMs: LOGIN_LIMIT_LOCK_SECONDS * 1_000,
};

/** เพิ่ม failure แบบ immutable โดยรักษา lock ที่ยังไม่หมดอายุ และเริ่ม window ใหม่ทันทีเมื่อ window หรือ lock เดิมหมดอายุ */
export function evaluateRateLimit(
  state: RateLimitState,
  policy: RateLimitPolicy,
  now: Date,
): RateLimitDecision {
  if (state.lockedUntil && state.lockedUntil.getTime() > now.getTime()) {
    return {
      attempts: state.attempts,
      windowStartedAt: new Date(state.windowStartedAt),
      lockedUntil: new Date(state.lockedUntil),
      blocked: true,
    };
  }

  const lockExpired =
    state.lockedUntil && state.lockedUntil.getTime() <= now.getTime();
  const windowExpired =
    now.getTime() - state.windowStartedAt.getTime() >= policy.windowMs;

  if (lockExpired || windowExpired) {
    return {
      attempts: 1,
      windowStartedAt: new Date(now),
      lockedUntil: null,
      blocked: false,
    };
  }

  const attempts = state.attempts + 1;
  const blocked = attempts >= policy.maxAttempts;

  return {
    attempts,
    windowStartedAt: new Date(state.windowStartedAt),
    lockedUntil: blocked
      ? new Date(now.getTime() + policy.lockMs)
      : null,
    blocked,
  };
}
