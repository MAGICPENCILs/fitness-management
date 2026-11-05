import type { DeliveryEnvironment } from "@/lib/notifications/providers/delivery";

/** ยอมรับ webhook ที่เข้ารหัสเท่านั้นเพื่อไม่ส่ง token หรือข้อมูลผู้รับผ่าน HTTP ปกติ */
function secureUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** โหลด provider config จาก environment โดยปิดทุกการส่งจริงหากไม่ได้ opt in ชัดเจน */
export function loadDeliveryEnvironment(
  source: Record<string, string | undefined> = process.env,
): DeliveryEnvironment {
  const mode =
    source.NOTIFICATION_PROVIDER_MODE === "simulate" ||
    source.NOTIFICATION_PROVIDER_MODE === "live"
      ? source.NOTIFICATION_PROVIDER_MODE
      : "disabled";
  const parsedPort = Number(source.NOTIFICATION_SMTP_PORT);
  return {
    mode,
    smsWebhookUrl: secureUrl(source.NOTIFICATION_SMS_WEBHOOK_URL),
    smsWebhookToken: source.NOTIFICATION_SMS_WEBHOOK_TOKEN,
    lineAccessToken: source.NOTIFICATION_LINE_ACCESS_TOKEN,
    emailFrom: source.NOTIFICATION_EMAIL_FROM,
    smtpHost: source.NOTIFICATION_SMTP_HOST,
    smtpPort: Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : undefined,
    smtpSecure: source.NOTIFICATION_SMTP_SECURE === "true",
    smtpUsername: source.NOTIFICATION_SMTP_USERNAME,
    smtpPassword: source.NOTIFICATION_SMTP_PASSWORD,
  };
}

/** คืนสถานะระดับช่องทางสำหรับหน้า Admin โดยบอกเพียงความพร้อมและไม่เปิดเผยค่า config */
export function getProviderHealth(environment: DeliveryEnvironment) {
  return {
    mode: environment.mode,
    inApp: "READY" as const,
    sms:
      environment.mode === "simulate" ||
      (environment.mode === "live" &&
        Boolean(environment.smsWebhookUrl && environment.smsWebhookToken))
        ? ("READY" as const)
        : ("DISABLED" as const),
    line: "UNAVAILABLE" as const,
    email:
      environment.mode === "simulate" ||
      (environment.mode === "live" &&
        Boolean(
          environment.emailFrom &&
            environment.smtpHost &&
            environment.smtpPort &&
            environment.smtpSecure,
        ))
        ? ("READY" as const)
        : ("DISABLED" as const),
  };
}
