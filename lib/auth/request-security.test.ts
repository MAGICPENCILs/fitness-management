import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertTrustedOrigin,
  getRequestFingerprintInput,
  getSafeReturnPath,
} from "@/lib/auth/request-security";

const originalOrigin = process.env.APP_ORIGIN;
const originalFingerprintSecret = process.env.AUTH_FINGERPRINT_SECRET;
const originalTrustProxy = process.env.TRUST_PROXY;

describe("request security", () => {
  beforeEach(() => {
    process.env.APP_ORIGIN = "https://fitness.example";
    process.env.AUTH_FINGERPRINT_SECRET =
      "test-fingerprint-secret-that-is-at-least-32-bytes";
    delete process.env.TRUST_PROXY;
  });

  afterEach(() => {
    if (originalOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = originalOrigin;
    if (originalFingerprintSecret === undefined) delete process.env.AUTH_FINGERPRINT_SECRET;
    else process.env.AUTH_FINGERPRINT_SECRET = originalFingerprintSecret;
    if (originalTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = originalTrustProxy;
  });

  it("accepts only local relative return paths", () => {
    expect(getSafeReturnPath("/members?tab=active")).toBe("/members?tab=active");
    expect(getSafeReturnPath("//evil.example")).toBe("/");
    expect(getSafeReturnPath("https://evil.example")).toBe("/");
  });

  it("requires an exact configured Origin", () => {
    expect(() =>
      assertTrustedOrigin(new Request("https://fitness.example/api/auth/login", {
        headers: { origin: "https://fitness.example" },
      })),
    ).not.toThrow();
    expect(() =>
      assertTrustedOrigin(new Request("https://fitness.example/api/auth/login", {
        headers: { origin: "https://evil.example" },
      })),
    ).toThrow();
  });

  it("returns an HMAC fingerprint and a coarse user-agent category", () => {
    process.env.TRUST_PROXY = "true";

    const fingerprint = getRequestFingerprintInput(
      new Request("https://fitness.example/api/auth/login", {
        headers: {
          "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile",
          "x-forwarded-for": "203.0.113.9",
        },
      }),
    );

    expect(fingerprint.ipFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprint.ipFingerprint).not.toContain("203.0.113.9");
    expect(fingerprint.userAgentCategory).toBe("MOBILE");
  });

  it("omits the IP fingerprint when the proxy is not explicitly trusted", () => {
    const firstRequest = new Request("https://fitness.example/api/auth/login", {
      headers: { "x-forwarded-for": "203.0.113.9" },
    });
    const secondRequest = new Request("https://fitness.example/api/auth/login", {
      headers: { "x-forwarded-for": "198.51.100.7" },
    });

    expect(getRequestFingerprintInput(firstRequest).ipFingerprint).toBeNull();
    expect(getRequestFingerprintInput(secondRequest).ipFingerprint).toBeNull();
  });
});
