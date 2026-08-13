import { describe, expect, it } from "vitest";

import {
  ACCOUNT_POLICY,
  evaluateRateLimit,
  IP_POLICY,
} from "@/lib/auth/rate-limit-core";

describe("rate limit state transitions", () => {
  it("locks account on the fifth failure in one window", () => {
    const now = new Date("2026-08-10T04:00:00.000Z");
    const state = {
      attempts: 4,
      windowStartedAt: now,
      lockedUntil: null,
    };

    const decision = evaluateRateLimit(state, ACCOUNT_POLICY, now);

    expect(decision).toMatchObject({ attempts: 5, blocked: true });
    expect(decision.lockedUntil).toEqual(
      new Date(now.getTime() + 15 * 60_000),
    );
    expect(state).toEqual({
      attempts: 4,
      windowStartedAt: now,
      lockedUntil: null,
    });
  });

  it("locks IP on the twentieth failure in one window", () => {
    const now = new Date("2026-08-10T04:00:00.000Z");

    const decision = evaluateRateLimit(
      { attempts: 19, windowStartedAt: now, lockedUntil: null },
      IP_POLICY,
      now,
    );

    expect(decision).toMatchObject({ attempts: 20, blocked: true });
  });

  it("starts a clean window after lock expiry", () => {
    const now = new Date("2026-08-10T04:30:00.000Z");
    const old = new Date("2026-08-10T04:00:00.000Z");

    const decision = evaluateRateLimit(
      { attempts: 5, windowStartedAt: old, lockedUntil: old },
      ACCOUNT_POLICY,
      now,
    );

    expect(decision).toMatchObject({ attempts: 1, blocked: false });
    expect(decision.windowStartedAt).toEqual(now);
    expect(decision.lockedUntil).toBeNull();
  });

  it("starts a clean window after an unlocked window expires", () => {
    const now = new Date("2026-08-10T04:30:00.000Z");
    const old = new Date("2026-08-10T04:00:00.000Z");

    const decision = evaluateRateLimit(
      { attempts: 2, windowStartedAt: old, lockedUntil: null },
      ACCOUNT_POLICY,
      now,
    );

    expect(decision).toEqual({
      attempts: 1,
      windowStartedAt: now,
      lockedUntil: null,
      blocked: false,
    });
  });

  it("keeps an active lock without extending it and detaches decision dates", () => {
    const now = new Date("2026-08-10T04:05:00.000Z");
    const state = {
      attempts: 5,
      windowStartedAt: new Date("2026-08-10T04:00:00.000Z"),
      lockedUntil: new Date("2026-08-10T04:15:00.000Z"),
    };

    const decision = evaluateRateLimit(state, ACCOUNT_POLICY, now);

    expect(decision).toMatchObject({ attempts: 5, blocked: true });
    expect(decision.windowStartedAt).toEqual(state.windowStartedAt);
    expect(decision.lockedUntil).toEqual(state.lockedUntil);
    expect(decision.windowStartedAt).not.toBe(state.windowStartedAt);
    expect(decision.lockedUntil).not.toBe(state.lockedUntil);
  });
});
