import { describe, expect, it } from "vitest";
import {
  createMemberAccessToken,
  hashMemberAccessToken,
  isMemberAccessTokenUsable,
} from "@/lib/member-token";

describe("dynamic member QR token", () => {
  it("สร้าง raw token แบบมี prefix แต่เก็บ hash เท่านั้น", () => {
    const created = createMemberAccessToken(new Date("2026-11-03T00:00:00Z"));
    expect(created.token).toMatch(/^FQR\.[A-Za-z0-9_-]{43}$/);
    expect(created.tokenHash).toBe(hashMemberAccessToken(created.token));
    expect(created.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(created.expiresAt.toISOString()).toBe("2026-11-03T00:05:00.000Z");
  });

  it("ใช้ได้เฉพาะ token ที่ยังไม่หมดอายุและไม่ถูก revoke", () => {
    const now = new Date("2026-11-03T00:00:00Z");
    expect(isMemberAccessTokenUsable(new Date("2026-11-03T00:01:00Z"), null, now)).toBe(true);
    expect(isMemberAccessTokenUsable(new Date("2026-11-02T23:59:59Z"), null, now)).toBe(false);
    expect(isMemberAccessTokenUsable(new Date("2026-11-03T00:01:00Z"), now, now)).toBe(false);
  });
});
