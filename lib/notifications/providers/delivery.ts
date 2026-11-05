export type DeliveryChannel = "IN_APP" | "SMS" | "LINE" | "EMAIL";

export type DeliveryNotification = {
  channel: DeliveryChannel;
  recipient: string | null;
  title: string;
  message: string;
};

export type DeliveryEnvironment = {
  mode: "disabled" | "simulate" | "live";
  smsWebhookUrl?: string;
  smsWebhookToken?: string;
  lineAccessToken?: string;
  emailFrom?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUsername?: string;
  smtpPassword?: string;
};

export type DeliveryResult =
  | { outcome: "sent" }
  | { outcome: "disabled"; errorCode: "PROVIDER_DISABLED" | "PROVIDER_NOT_CONFIGURED" }
  | {
      outcome: "retryable_failure";
      errorCode: "PROVIDER_TEMPORARY_FAILURE";
    }
  | {
      outcome: "permanent_failure";
      errorCode: "RECIPIENT_MISSING" | "PROVIDER_REJECTED";
    };

export const NOTIFICATION_CLAIM_LEASE_MS = 5 * 60 * 1000;

type DeliveryDependencies = {
  request?: typeof fetch;
  sendSmtp?: (
    notification: DeliveryNotification,
    environment: DeliveryEnvironment,
  ) => Promise<void>;
};

/** อนุญาต retry เฉพาะ error ชั่วคราวหรือ config ที่แก้ได้ และจำกัดจำนวนครั้งเพื่อไม่ยิง provider ไม่สิ้นสุด */
export function canRetryDelivery(
  status: "QUEUED" | "PROCESSING" | "SENT" | "FAILED" | "SKIPPED",
  failureKind: "RETRYABLE" | "PERMANENT" | "CONFIG" | null,
  attemptCount: number,
) {
  return (
    attemptCount < 5 &&
    ((status === "FAILED" && failureKind === "RETRYABLE") ||
      (status === "SKIPPED" && failureKind === "CONFIG"))
  );
}

/** อนุญาตยึดงาน PROCESSING เดิมซ้ำเมื่อ lease หมดเท่านั้น เพื่อกู้คิวหลัง worker ล้มโดยไม่ชน worker ที่ยังทำงาน */
export function canClaimDelivery(
  status: "QUEUED" | "PROCESSING" | "SENT" | "FAILED" | "SKIPPED",
  failureKind: "RETRYABLE" | "PERMANENT" | "CONFIG" | null,
  attemptCount: number,
  lastAttemptAt: Date | null,
  now = new Date(),
) {
  return (
    attemptCount < 5 &&
    (status === "QUEUED" ||
      canRetryDelivery(status, failureKind, attemptCount) ||
      (status === "PROCESSING" &&
        (!lastAttemptAt ||
          lastAttemptAt.getTime() <= now.getTime() - NOTIFICATION_CLAIM_LEASE_MS)))
  );
}

/** แปลง HTTP status จาก provider เป็นผลลัพธ์ที่ retry ได้หรือถาวร โดยไม่อ่านข้อความตอบกลับซึ่งอาจมี PII */
function classifyHttpResponse(response: Response): DeliveryResult {
  if (response.ok) return { outcome: "sent" };
  if (response.status === 408 || response.status === 429 || response.status >= 500)
    return {
      outcome: "retryable_failure",
      errorCode: "PROVIDER_TEMPORARY_FAILURE",
    };
  return { outcome: "permanent_failure", errorCode: "PROVIDER_REJECTED" };
}

/** เรียก HTTP provider ด้วย timeout คงที่และคืน error code ทั่วไปเพื่อไม่เผย recipient หรือ credential */
async function postJson(
  url: string,
  token: string,
  body: unknown,
  request: typeof fetch,
): Promise<DeliveryResult> {
  try {
    const response = await request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    return classifyHttpResponse(response);
  } catch {
    return {
      outcome: "retryable_failure",
      errorCode: "PROVIDER_TEMPORARY_FAILURE",
    };
  }
}

/** ส่งข้อความผ่าน adapter ที่เปิดด้วย config เท่านั้น; disabled เป็นค่าเริ่มต้นและ simulator ไม่แตะเครือข่าย */
export async function deliverNotification(
  notification: DeliveryNotification,
  environment: DeliveryEnvironment,
  dependencies: DeliveryDependencies = {},
): Promise<DeliveryResult> {
  if (!notification.recipient && notification.channel !== "IN_APP") {
    return { outcome: "permanent_failure", errorCode: "RECIPIENT_MISSING" };
  }
  if (notification.channel === "IN_APP") return { outcome: "sent" };
  if (environment.mode === "disabled")
    return { outcome: "disabled", errorCode: "PROVIDER_DISABLED" };
  if (environment.mode === "simulate") return { outcome: "sent" };

  const request = dependencies.request ?? fetch;
  if (notification.channel === "SMS") {
    if (!environment.smsWebhookUrl || !environment.smsWebhookToken)
      return { outcome: "disabled", errorCode: "PROVIDER_NOT_CONFIGURED" };
    return postJson(
      environment.smsWebhookUrl,
      environment.smsWebhookToken,
      { to: notification.recipient, message: notification.message },
      request,
    );
  }
  if (notification.channel === "LINE") {
    if (!environment.lineAccessToken)
      return { outcome: "disabled", errorCode: "PROVIDER_NOT_CONFIGURED" };
    return postJson(
      "https://api.line.me/v2/bot/message/push",
      environment.lineAccessToken,
      {
        to: notification.recipient,
        messages: [{ type: "text", text: notification.message }],
      },
      request,
    );
  }

  if (
    !environment.emailFrom ||
    !environment.smtpHost ||
    !environment.smtpPort ||
    !environment.smtpSecure ||
    !dependencies.sendSmtp
  ) {
    return { outcome: "disabled", errorCode: "PROVIDER_NOT_CONFIGURED" };
  }
  try {
    await dependencies.sendSmtp(notification, environment);
    return { outcome: "sent" };
  } catch {
    return {
      outcome: "retryable_failure",
      errorCode: "PROVIDER_TEMPORARY_FAILURE",
    };
  }
}
