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
    resolveRequest?.(new Response(JSON.stringify({ message: "raw-session-token-must-never-render" }), { status: 200 }));
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith("/api/security/sessions/12/revoke", { method: "POST" });
    expect(screen.getByRole("status")).toHaveTextContent("ยกเลิกเซสชันแล้ว");
    expect(screen.queryByText("raw-session-token-must-never-render")).not.toBeInTheDocument();
  });

  it("revoke-all ใช้ staffId และคง dialog/error ไว้เมื่อ server ปฏิเสธ", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "token=raw-session-token-must-never-render 203.0.113.24" }), { status: 403 }),
    );
    const user = userEvent.setup();
    render(<SecurityConsole {...props} />);
    await user.click(screen.getAllByRole("button", { name: "ยกเลิกทุกเซสชันของ เคาน์เตอร์ หนึ่ง" })[0]);
    expect(screen.getByRole("dialog")).toHaveTextContent("ยกเลิกทุกเซสชัน");
    await user.click(screen.getByRole("button", { name: "ยืนยันยกเลิกทั้งหมด" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("คุณไม่มีสิทธิ์ดำเนินการนี้"));
    expect(screen.queryByText(/raw-session-token-must-never-render|203\.0\.113\.24/)).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/security/staff/3/revoke", { method: "POST" });
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it.each([
    [401, "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่"],
    [404, "ไม่พบรายการที่ต้องการจัดการ"],
    [500, "ไม่สามารถดำเนินการได้ กรุณาลองใหม่"],
  ])("ใช้ข้อความคงที่สำหรับ HTTP %s โดยไม่ render HTML/internal response", async (status, expected) => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("<html>raw-session-token-must-never-render 203.0.113.24</html>", { status }),
    );
    const user = userEvent.setup();
    render(<SecurityConsole {...props} />);
    await user.click(screen.getAllByRole("button", { name: "ยกเลิกเซสชันของ เคาน์เตอร์ หนึ่ง" })[0]);
    await user.click(screen.getByRole("button", { name: "ยืนยันยกเลิกเซสชัน" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent(expected));
    expect(screen.queryByText(/raw-session-token-must-never-render|203\.0\.113\.24/)).not.toBeInTheDocument();
  });

  it("network error ใช้ข้อความกลางและไม่สะท้อน error detail", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("raw-session-token-must-never-render 203.0.113.24"));
    const user = userEvent.setup();
    render(<SecurityConsole {...props} />);
    await user.click(screen.getAllByRole("button", { name: "ยกเลิกเซสชันของ เคาน์เตอร์ หนึ่ง" })[0]);
    await user.click(screen.getByRole("button", { name: "ยืนยันยกเลิกเซสชัน" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่"));
    expect(screen.queryByText(/raw-session-token-must-never-render|203\.0\.113\.24/)).not.toBeInTheDocument();
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

  it("แสดงเฉพาะ fingerprint hex ย่อและใช้ fallback ในข้อความ/accessible name", async () => {
    const malicious = structuredClone(dashboard);
    malicious.sessions.rows[0].ipFingerprint = "A1B2C3D4E5F6";
    malicious.sessions.rows[1].ipFingerprint = "f".repeat(64);
    malicious.limits.rows[1].fingerprint = "203.0.113.24";
    malicious.limits.rows[1].manageable = true;
    const user = userEvent.setup();
    render(<SecurityConsole {...props} data={malicious} />);
    expect(screen.getAllByText("a1b2c3d4e5f6")).toHaveLength(2);
    expect(screen.getAllByText("ไม่ทราบ fingerprint")).toHaveLength(2);
    expect(screen.queryByText("f".repeat(64))).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Rate limit" }));
    expect(screen.getByRole("button", { name: "ปลดล็อก ไม่ทราบ fingerprint" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "ปลดล็อก ไม่ทราบ fingerprint" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("ไม่ทราบ fingerprint");
    expect(screen.queryByText("203.0.113.24")).not.toBeInTheDocument();
  });

  it("sync tab และ filter drafts เมื่อ server props เปลี่ยนจาก Back/Forward", async () => {
    const { rerender } = render(<SecurityConsole {...props} />);
    rerender(
      <SecurityConsole
        {...props}
        filters={{ tab: "events", branchId: 2, staffId: 3, action: "LOGIN_FAILED", result: "FAILED", from: "2026-08-01", to: "2026-08-10" }}
      />,
    );
    await waitFor(() => expect(screen.getByRole("tab", { name: "เหตุการณ์ Login" })).toHaveAttribute("aria-selected", "true"));
    expect(screen.getByLabelText("สาขา")).toHaveValue("2");
    expect(screen.getByLabelText("Staff ID")).toHaveValue("3");
    expect(screen.getByLabelText("Action")).toHaveValue("LOGIN_FAILED");
    expect(screen.getByLabelText("ผลลัพธ์")).toHaveValue("FAILED");
    expect(screen.getByText("ไม่ทราบบัญชี")).toBeVisible();
  });

  it("แสดง window/lockedUntil และ absolute/idle expiry ครบทั้ง desktop/mobile", async () => {
    const user = userEvent.setup();
    render(<SecurityConsole {...props} />);
    expect(screen.getAllByText("Absolute / Idle")).toHaveLength(3);
    expect(screen.getAllByText(/Idle/).length).toBeGreaterThanOrEqual(2);
    await user.click(screen.getByRole("tab", { name: "Rate limit" }));
    expect(screen.getAllByText("เริ่ม window")).toHaveLength(2);
    expect(screen.getAllByText("ล็อกถึง")).toHaveLength(2);
  });

  it("clear rate limit ใช้ endpoint id และ method ที่กำหนด", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("<html>internal</html>", { status: 200 }));
    const user = userEvent.setup();
    render(<SecurityConsole {...props} filters={{ tab: "limits" }} />);
    await user.click(screen.getByRole("button", { name: "ปลดล็อก เคาน์เตอร์ หนึ่ง" }));
    await user.click(screen.getByRole("button", { name: "ยืนยันปลดล็อก" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/security/rate-limits/21/clear", { method: "POST" }));
    expect(screen.getByRole("status")).toHaveTextContent("ปลดล็อก Rate limit แล้ว");
    expect(screen.queryByText("internal")).not.toBeInTheDocument();
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
