export type ConsentType = "SERVICE_PRIVACY" | "MARKETING" | "PHOTO";
export type ConsentAction = "GRANTED" | "WITHDRAWN";
export type ConsentSnapshot = Record<ConsentType, boolean>;

/** เวอร์ชันนโยบายที่ระบบเปิดให้ยอมรับในขณะนี้ เพื่อไม่รับค่าที่ public client กำหนดเอง */
export const ACTIVE_PRIVACY_POLICY_VERSION = "2026-11";

type ConsentPolicyEvent = {
  id?: number;
  consentType: ConsentType;
  action: ConsentAction;
  createdAt: Date;
};

/** เลือก consent event ล่าสุดของแต่ละประเภทด้วยเวลาและ id เป็นตัวตัดสินลำดับ */
export function getLatestConsent(
  events: readonly ConsentPolicyEvent[],
): ConsentSnapshot {
  const latest = new Map<ConsentType, ConsentPolicyEvent>();
  for (const event of events) {
    const current = latest.get(event.consentType);
    if (
      !current ||
      event.createdAt.getTime() > current.createdAt.getTime() ||
      (event.createdAt.getTime() === current.createdAt.getTime() &&
        (event.id ?? 0) > (current.id ?? 0))
    ) {
      latest.set(event.consentType, event);
    }
  }

  return {
    SERVICE_PRIVACY:
      latest.get("SERVICE_PRIVACY")?.action === "GRANTED",
    MARKETING: latest.get("MARKETING")?.action === "GRANTED",
    PHOTO: latest.get("PHOTO")?.action === "GRANTED",
  };
}

/** อนุญาตสมัครสมาชิกเมื่อยอมรับ service privacy โดยไม่บังคับ marketing หรือ photo */
export function canCreateMember(consents: ConsentSnapshot) {
  return consents.SERVICE_PRIVACY;
}
