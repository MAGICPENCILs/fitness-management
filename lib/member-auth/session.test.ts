import { describe, expect, it } from "vitest";
import {
  createMemberSessionToken,
  hashMemberSessionToken,
  isMemberSessionActive,
  MEMBER_SESSION_COOKIE,
} from "@/lib/member-auth/session";

describe("member session isolation", () => {
  it("ใช้ cookie คนละชื่อกับ Staff และเก็บเฉพาะ hash", () => {
    const token = createMemberSessionToken();
    expect(MEMBER_SESSION_COOKIE).toBe("fitness_member_session");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashMemberSessionToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashMemberSessionToken(token)).not.toBe(token);
  });

  it("ปฏิเสธ session หมดอายุหรือถูก revoke", () => {
    const now = new Date("2026-11-03T00:00:00Z");
    expect(isMemberSessionActive(new Date("2026-11-04T00:00:00Z"), null, now)).toBe(true);
    expect(isMemberSessionActive(now, null, now)).toBe(false);
    expect(isMemberSessionActive(new Date("2026-11-04T00:00:00Z"), now, now)).toBe(false);
  });
});
