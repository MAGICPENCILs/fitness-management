import { describe, expect, it } from "vitest";
import {
  hashPassword,
  validatePassword,
  verifyPassword,
} from "@/lib/auth/password";

describe("password security", () => {
  it("บังคับ password policy ครบทุกประเภท", () => {
    expect(validatePassword("ValidPass#2026")).toEqual({
      valid: true,
      errors: [],
    });
    expect(validatePassword("short").valid).toBe(false);
  });

  it("hash และ verify โดยไม่คืน plaintext", async () => {
    const hash = await hashPassword("ValidPass#2026");

    expect(hash).not.toContain("ValidPass#2026");
    await expect(verifyPassword(hash, "ValidPass#2026")).resolves.toBe(true);
    await expect(verifyPassword(hash, "WrongPass#2026")).resolves.toBe(false);
  });
});
