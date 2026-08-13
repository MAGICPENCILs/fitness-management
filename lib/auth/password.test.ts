import * as argon2 from "@node-rs/argon2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as passwordModule from "@/lib/auth/password";
import {
  hashPassword,
  validatePassword,
  verifyPassword,
  verifyPasswordOrDummy,
} from "@/lib/auth/password";

vi.mock("@node-rs/argon2", { spy: true });

describe("password security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("uses a private dummy Argon2id verification for an unknown account", async () => {
    await expect(
      verifyPasswordOrDummy(null, "UnknownPass#2026"),
    ).resolves.toBe(false);

    expect(argon2.verify).toHaveBeenCalledOnce();
    expect(argon2.verify).toHaveBeenCalledWith(
      expect.stringMatching(/^\$argon2id\$/),
      "UnknownPass#2026",
    );
    expect(passwordModule).not.toHaveProperty("DUMMY_PASSWORD_HASH");
  });
});
