// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/security",
  useRouter: () => navigation,
}));

import { SecurityConsole } from "@/components/security/security-console";

const dashboard = {
  sessions: {
    rows: [
      {
        id: 11,
        staffId: 1,
        staffName: "เจ้าของ ระบบ",
        role: "OWNER" as const,
        homeBranchId: 1,
        branchName: "สำนักงานใหญ่",
        mode: "FULL" as const,
        createdAt: "2026-08-10T08:00:00.000Z",
        lastSeenAt: "2026-08-10T09:00:00.000Z",
        absoluteExpiresAt: "2026-08-10T16:00:00.000Z",
        idleExpiresAt: "2026-08-10T09:30:00.000Z",
        revokedAt: null,
        revokedReason: null,
        status: "ACTIVE" as const,
        ipFingerprint: "aaaaaaaaaaaa",
        userAgentCategory: "DESKTOP",
        manageable: false,
        sessionTokenHash: "raw-session-token-must-never-render",
        rawIpAddress: "203.0.113.24",
      },
      {
        id: 12,
        staffId: 3,
        staffName: "เคาน์เตอร์ หนึ่ง",
        role: "COUNTER" as const,
        homeBranchId: 2,
        branchName: "สาขาสอง",
        mode: "FULL" as const,
        createdAt: "2026-08-10T08:15:00.000Z",
        lastSeenAt: "2026-08-10T09:05:00.000Z",
        absoluteExpiresAt: "2026-08-10T16:15:00.000Z",
        idleExpiresAt: "2026-08-10T09:35:00.000Z",
        revokedAt: null,
        revokedReason: null,
        status: "ACTIVE" as const,
        ipFingerprint: "bbbbbbbbbbbb",
        userAgentCategory: "MOBILE",
        manageable: true,
      },
    ],
    pagination: { page: 1, pageSize: 20, total: 2 },
  },
  limits: {
    rows: [
      {
        id: 21,
        scope: "ACCOUNT" as const,
        fingerprint: "cccccccccccc",
        attemptCount: 5,
        windowStartedAt: "2026-08-10T08:00:00.000Z",
        lockedUntil: "2026-08-10T08:15:00.000Z",
        updatedAt: "2026-08-10T08:05:00.000Z",
        locked: true,
        staff: { id: 3, name: "เคาน์เตอร์ หนึ่ง", role: "COUNTER" as const, homeBranchId: 2, branchName: "สาขาสอง" },
        manageable: true,
      },
      {
        id: 22,
        scope: "IP" as const,
        fingerprint: "dddddddddddd",
        attemptCount: 20,
        windowStartedAt: "2026-08-10T08:00:00.000Z",
        lockedUntil: null,
        updatedAt: "2026-08-10T08:05:00.000Z",
        locked: false,
        staff: null,
        manageable: false,
      },
    ],
    pagination: { page: 1, pageSize: 20, total: 2 },
  },
  events: {
    rows: [
      {
        id: 31,
        branchId: null,
        branchName: null,
        actorStaffId: null,
        actorName: null,
        action: "LOGIN_FAILED",
        entityType: "AUTH_LOGIN",
        entityId: null,
        result: "FAILED" as const,
        metadata: {
          reasonCode: "INVALID_CREDENTIALS",
          ipFingerprint: "eeeeeeeeeeee",
          requestBody: "raw-session-token-must-never-render",
          rawIpAddress: "203.0.113.24",
        },
        createdAt: "2026-08-10T08:10:00.000Z",
      },
    ],
    pagination: { page: 1, pageSize: 20, total: 1 },
  },
};

const props = {
  data: dashboard,
  branches: [{ id: 1, name: "สำนักงานใหญ่" }, { id: 2, name: "สาขาสอง" }],
  filters: { tab: "sessions" as const },
};

describe("SecurityConsole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("แสดง semantic tabs และข้อมูลปลอดภัยโดยไม่ render secret", () => {
    render(<SecurityConsole {...props} />);
    expect(screen.getByRole("tab", { name: "เซสชัน" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Rate limit" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "เหตุการณ์ Login" })).toBeVisible();
    expect(screen.queryByText("raw-session-token-must-never-render")).not.toBeInTheDocument();
    expect(screen.queryByText("203.0.113.24")).not.toBeInTheDocument();
    expect(screen.getAllByText("aaaaaaaaaaaa")).toHaveLength(2);
  });

  it("เปลี่ยน tab ด้วย ArrowRight และเก็บสถานะใน URL", async () => {
    const user = userEvent.setup();
    render(<SecurityConsole {...props} />);
    const sessionsTab = screen.getByRole("tab", { name: "เซสชัน" });
    sessionsTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Rate limit" })).toHaveFocus();
    expect(navigation.push).toHaveBeenCalledWith("/settings/security?tab=limits");
  });

  it("รองรับ Home/End ตาม tab keyboard pattern", async () => {
    const user = userEvent.setup();
    render(<SecurityConsole {...props} />);
    const sessionsTab = screen.getByRole("tab", { name: "เซสชัน" });
    sessionsTab.focus();
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "เหตุการณ์ Login" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(sessionsTab).toHaveFocus();
  });

  it("แสดง action เฉพาะ row ที่จัดการได้ และ dialog ระบุเป้าหมาย/ผลกระทบพร้อมคืน focus", async () => {
    const user = userEvent.setup();
    render(<SecurityConsole {...props} />);
    expect(screen.queryByRole("button", { name: "ยกเลิกเซสชันของ เจ้าของ ระบบ" })).not.toBeInTheDocument();
    const trigger = screen.getAllByRole("button", { name: "ยกเลิกเซสชันของ เคาน์เตอร์ หนึ่ง" })[0];
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toHaveTextContent("เคาน์เตอร์ หนึ่ง");
    expect(screen.getByRole("dialog")).toHaveTextContent("ต้องเข้าสู่ระบบใหม่");
    await user.click(screen.getByRole("button", { name: "ยกเลิก" }));
    expect(trigger).toHaveFocus();
  });

  it("ปิด action ระหว่าง pending และประกาศผลสำเร็จก่อน refresh", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    const user = userEvent.setup();
    render(<SecurityConsole {...props} />);
    await user.click(screen.getAllByRole("button", { name: "ยกเลิกเซสชันของ เคาน์เตอร์ หนึ่ง" })[0]);
    const confirm = screen.getByRole("button", { name: "ยืนยันยกเลิกเซสชัน" });
    await user.click(confirm);
    expect(confirm).toBeDisabled();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
    resolveRequest?.(new Response(JSON.stringify({ message: "ยกเลิก session แล้ว" }), { status: 200 }));
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledOnce());
    expect(screen.getByRole("status")).toHaveTextContent("ยกเลิก session แล้ว");
  });

  it("revoke-all ใช้ staffId และคง dialog/error ไว้เมื่อ server ปฏิเสธ", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "ไม่มีสิทธิ์จัดการบัญชีเป้าหมายนี้" }), { status: 403 }),
    );
    const user = userEvent.setup();
    render(<SecurityConsole {...props} />);
    await user.click(screen.getAllByRole("button", { name: "ยกเลิกทุกเซสชันของ เคาน์เตอร์ หนึ่ง" })[0]);
    expect(screen.getByRole("dialog")).toHaveTextContent("ยกเลิกทุกเซสชัน");
    await user.click(screen.getByRole("button", { name: "ยืนยันยกเลิกทั้งหมด" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("ไม่มีสิทธิ์จัดการบัญชีเป้าหมายนี้"));
    expect(fetch).toHaveBeenCalledWith("/api/security/staff/3/revoke", { method: "POST" });
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it("แสดง rate limit/unknown event และซ่อน action ที่ server ระบุว่าจัดการไม่ได้", async () => {
    const user = userEvent.setup();
    render(<SecurityConsole {...props} />);
    await user.click(screen.getByRole("tab", { name: "Rate limit" }));
    expect(screen.getByText("ไม่ทราบบัญชี")).toBeVisible();
    expect(screen.getByRole("button", { name: "ปลดล็อก เคาน์เตอร์ หนึ่ง" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /dddddddddddd/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "เหตุการณ์ Login" }));
    expect(screen.getByText("ไม่ทราบบัญชี")).toBeVisible();
    expect(screen.getByText("INVALID_CREDENTIALS")).toBeVisible();
    expect(screen.queryByText("raw-session-token-must-never-render")).not.toBeInTheDocument();
    expect(screen.queryByText("203.0.113.24")).not.toBeInTheDocument();
  });

  it("แสดง empty state และเขียน filter/page ลง URL", async () => {
    const user = userEvent.setup();
    render(
      <SecurityConsole
        {...props}
        data={{ ...dashboard, events: { rows: [], pagination: { page: 1, pageSize: 20, total: 0 } } }}
        filters={{ tab: "events", action: "LOGIN_FAILED" }}
      />,
    );
    expect(screen.getByText("ยังไม่มีเหตุการณ์ตามตัวกรองนี้")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("ผลลัพธ์"), "FAILED");
    await user.click(screen.getByRole("button", { name: "ใช้ตัวกรอง" }));
    expect(navigation.push).toHaveBeenCalledWith(expect.stringContaining("result=FAILED"));
  });
});
