import { describe, expect, it } from "vitest";
import { canCreateMember, getLatestConsent } from "@/lib/consent-policy";

describe("consent policy", () => {
  it("เลือก event ล่าสุดแยกตาม consent type และใช้ id ตัดสินเมื่อเวลาเท่ากัน", () => {
    expect(
      getLatestConsent([
        {
          id: 1,
          consentType: "MARKETING",
          action: "GRANTED",
          createdAt: new Date("2026-01-01"),
        },
        {
          id: 2,
          consentType: "MARKETING",
          action: "WITHDRAWN",
          createdAt: new Date("2026-01-02"),
        },
        {
          id: 4,
          consentType: "PHOTO",
          action: "GRANTED",
          createdAt: new Date("2026-01-03"),
        },
        {
          id: 5,
          consentType: "PHOTO",
          action: "WITHDRAWN",
          createdAt: new Date("2026-01-03"),
        },
      ]),
    ).toMatchObject({ MARKETING: false, PHOTO: false });
  });

  it("สมัครไม่ได้หากไม่มี service privacy consent", () => {
    expect(
      canCreateMember({
        SERVICE_PRIVACY: false,
        MARKETING: true,
        PHOTO: true,
      }),
    ).toBe(false);
  });

  it("marketing และ photo ไม่เป็นเงื่อนไขบังคับสมัคร", () => {
    expect(
      canCreateMember({
        SERVICE_PRIVACY: true,
        MARKETING: false,
        PHOTO: false,
      }),
    ).toBe(true);
  });
});
