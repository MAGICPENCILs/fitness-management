// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NotificationManager } from "@/components/settings/notification-manager";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(cleanup);

it.each([
  ["LINE", "SKIPPED", "CONFIG", 0, false],
  ["LINE", "SKIPPED", "CONFIG", 4, false],
  ["SMS", "SKIPPED", "CONFIG", 4, true],
  ["EMAIL", "SKIPPED", "CONFIG", 4, true],
  ["LINE", "FAILED", "RETRYABLE", 4, true],
  ["SMS", "FAILED", "RETRYABLE", 4, true],
  ["EMAIL", "FAILED", "RETRYABLE", 4, true],
  ["SMS", "SKIPPED", "CONFIG", 5, false],
  ["EMAIL", "FAILED", "RETRYABLE", 5, false],
] as const)("renders retry for %s/%s/%s at %i attempts: %s", (channel, status, failureKind, attemptCount, canRetry) => {
  render(
    <NotificationManager
      settings={{ reminderDays: "7,3,1", inactivityDays: 30, enableInApp: true, enableSms: true, enableLine: false, enableEmail: true, isActive: true }}
      providerHealth={{ mode: "disabled", inApp: "READY", sms: "DISABLED", line: "UNAVAILABLE", email: "DISABLED" }}
      history={[{
        id: 1,
        memberId: 7,
        memberCode: "M007",
        memberName: "สมชาย",
        memberLastName: "ทดสอบ",
        type: "EXPIRY_REMINDER",
        channel,
        status,
        title: "แจ้งเตือนสมาชิก",
        message: "สมาชิกใกล้หมดอายุ",
        scheduledFor: "2026-11-09",
        errorMessage: null,
        failureKind,
        attemptCount,
        lastAttemptAt: null,
        createdAt: "2026-11-09T00:00:00.000Z",
      }]}
    />,
  );
  if (canRetry) expect(screen.getByRole("button", { name: "ส่งซ้ำ" })).toBeInTheDocument();
  else expect(screen.queryByRole("button", { name: "ส่งซ้ำ" })).not.toBeInTheDocument();
});
