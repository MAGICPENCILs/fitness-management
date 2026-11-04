import { describe, expect, it, vi } from "vitest";
import {
  canClaimDelivery,
  canRetryDelivery,
  deliverNotification,
  type DeliveryEnvironment,
  type DeliveryNotification,
} from "@/lib/notifications/providers/delivery";
import {
  getProviderHealth,
  loadDeliveryEnvironment,
} from "@/lib/notifications/providers/config";

const notification: DeliveryNotification = {
  channel: "SMS",
  recipient: "0812345678",
  title: "แจ้งเตือน",
  message: "ข้อความทดสอบ",
};

const disabledEnvironment: DeliveryEnvironment = {
  mode: "disabled",
};

describe("notification delivery providers", () => {
  it("ปิด provider เป็นค่าเริ่มต้นและไม่เรียกเครือข่าย", async () => {
    const request = vi.fn();

    await expect(
      deliverNotification(notification, disabledEnvironment, { request }),
    ).resolves.toEqual({
      outcome: "disabled",
      errorCode: "PROVIDER_DISABLED",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("โหมด simulator ส่งผลสำเร็จแบบ deterministic โดยไม่เรียกเครือข่าย", async () => {
    const request = vi.fn();

    await expect(
      deliverNotification(notification, { mode: "simulate" }, { request }),
    ).resolves.toEqual({ outcome: "sent" });
    expect(request).not.toHaveBeenCalled();
  });

  it("จัด 429 และ 5xx เป็น retryable โดยไม่สะท้อน response body", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response("secret provider detail", { status: 429 }),
    );

    await expect(
      deliverNotification(
        notification,
        {
          mode: "live",
          smsWebhookUrl: "https://sms.example/send",
          smsWebhookToken: "token-secret",
        },
        { request },
      ),
    ).resolves.toEqual({
      outcome: "retryable_failure",
      errorCode: "PROVIDER_TEMPORARY_FAILURE",
    });
  });

  it("จัด 4xx ที่ไม่ใช่ 408/429 เป็น permanent failure", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));

    await expect(
      deliverNotification(
        notification,
        {
          mode: "live",
          smsWebhookUrl: "https://sms.example/send",
          smsWebhookToken: "token-secret",
        },
        { request },
      ),
    ).resolves.toEqual({
      outcome: "permanent_failure",
      errorCode: "PROVIDER_REJECTED",
    });
  });

  it("ไม่ส่งเมื่อไม่มี recipient และจัดเป็น permanent failure", async () => {
    await expect(
      deliverNotification(
        { ...notification, recipient: null },
        { mode: "simulate" },
      ),
    ).resolves.toEqual({
      outcome: "permanent_failure",
      errorCode: "RECIPIENT_MISSING",
    });
  });

  it("retry ได้เฉพาะความล้มเหลวชั่วคราวหรือ config และไม่เกิน 5 ครั้ง", () => {
    expect(canRetryDelivery("FAILED", "RETRYABLE", 4)).toBe(true);
    expect(canRetryDelivery("SKIPPED", "CONFIG", 0)).toBe(true);
    expect(canRetryDelivery("FAILED", "PERMANENT", 1)).toBe(false);
    expect(canRetryDelivery("SENT", null, 1)).toBe(false);
    expect(canRetryDelivery("FAILED", "RETRYABLE", 5)).toBe(false);
  });

  it("ยึด PROCESSING ซ้ำได้หลัง lease หมด แต่ claim ใหม่กัน worker พร้อมกัน", () => {
    const now = new Date("2026-11-04T03:10:00.000Z");
    const staleClaim = new Date("2026-11-04T03:04:59.000Z");

    expect(canClaimDelivery("PROCESSING", null, 1, staleClaim, now)).toBe(true);
    expect(canClaimDelivery("PROCESSING", null, 2, now, now)).toBe(false);
    expect(canClaimDelivery("PROCESSING", null, 5, staleClaim, now)).toBe(false);
  });

  it("โหลด config แบบ fail closed และ health ไม่คืน credential", () => {
    const environment = loadDeliveryEnvironment({
      NOTIFICATION_PROVIDER_MODE: "unexpected",
      NOTIFICATION_SMS_WEBHOOK_TOKEN: "secret",
    });
    expect(environment.mode).toBe("disabled");
    expect(getProviderHealth(environment)).toEqual({
      mode: "disabled",
      inApp: "READY",
      sms: "DISABLED",
      line: "UNAVAILABLE",
      email: "DISABLED",
    });
    expect(JSON.stringify(getProviderHealth(environment))).not.toContain("secret");
  });

  it("ส่งอีเมลผ่าน SMTP transport ที่ฉีดเข้ามาเมื่อ config TLS ครบ", async () => {
    const sendSmtp = vi.fn().mockResolvedValue(undefined);
    await expect(
      deliverNotification(
        {
          ...notification,
          channel: "EMAIL",
          recipient: "member@example.com",
        },
        {
          mode: "live",
          emailFrom: "fitness@example.com",
          smtpHost: "smtp.example.com",
          smtpPort: 465,
          smtpSecure: true,
        },
        { sendSmtp },
      ),
    ).resolves.toEqual({ outcome: "sent" });
    expect(sendSmtp).toHaveBeenCalledOnce();
  });
});
