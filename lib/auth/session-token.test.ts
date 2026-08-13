import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import {
  createSessionId,
  hashSessionId,
  signSessionClaims,
  verifySessionClaims,
} from "@/lib/auth/session-token";
import type { SessionClaims } from "@/lib/auth/types";

const originalSessionSecret = process.env.AUTH_SESSION_SECRET;

describe("session token security", () => {
  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = "test-session-secret-that-is-at-least-32-bytes";
  });

  afterEach(() => {
    if (originalSessionSecret === undefined) {
      delete process.env.AUTH_SESSION_SECRET;
      return;
    }
    process.env.AUTH_SESSION_SECRET = originalSessionSecret;
  });

  it("round-trips signed minimal claims and rejects tampering", async () => {
    const validClaims: SessionClaims = {
      sessionId: "session-id-for-test",
      staffId: 1,
      role: "OWNER",
      homeBranchId: 1,
      mode: "FULL",
      expiresAt: 1786377600,
    };
    const token = await signSessionClaims(validClaims);

    await expect(verifySessionClaims(token)).resolves.toEqual(validClaims);
    await expect(verifySessionClaims(`${token}x`)).resolves.toBeNull();
  });

  it("creates distinct IDs and stores only a deterministic SHA-256 hash", () => {
    const sessionId = createSessionId();

    expect(createSessionId()).not.toBe(sessionId);
    expect(hashSessionId(sessionId)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionId(sessionId)).not.toContain(sessionId);
  });

  it("rejects a validly signed token with a role outside the staff allowlist", async () => {
    const token = await new SignJWT({
      sessionId: "session-id-for-test",
      staffId: 1,
      role: "GUEST",
      homeBranchId: 1,
      mode: "FULL",
      expiresAt: 1786377600,
    })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode(process.env.AUTH_SESSION_SECRET));

    await expect(verifySessionClaims(token)).resolves.toBeNull();
  });
});
