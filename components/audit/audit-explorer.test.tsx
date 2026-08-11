// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/audit",
  useRouter: () => ({ push: vi.fn() }),
}));

import { AuditExplorer } from "@/components/audit/audit-explorer";

afterEach(cleanup);

describe("AuditExplorer nullable auth rows", () => {
  it("renders unknown actor/branch while filtering arbitrary metadata and full fingerprints at the display boundary", () => {
    render(
      <AuditExplorer
        rows={[{
          id: 31,
          branchId: null,
          branchName: "ไม่ทราบสาขา",
          actorStaffId: null,
          actorName: "ไม่ทราบบัญชี",
          action: "LOGIN_FAILED",
          entityType: "AUTH_LOGIN",
          entityId: null,
          result: "FAILED",
          metadata: {
            reasonCode: "INVALID_CREDENTIALS",
            ipFingerprint: "a".repeat(64),
            requestBody: "raw-session-token 203.0.113.24",
          },
          createdAt: "2026-08-11T06:00:00.000Z",
        }]}
        branches={[]}
        filters={{}}
        pagination={{ page: 1, pageSize: 20, total: 1 }}
      />,
    );

    expect(screen.getByText("ไม่ทราบบัญชี")).toBeVisible();
    expect(screen.getByText("ไม่ทราบสาขา")).toBeVisible();
    expect(screen.getByText(/INVALID_CREDENTIALS/)).toBeVisible();
    expect(screen.queryByText(/raw-session-token|203\.0\.113\.24/)).not.toBeInTheDocument();
    expect(screen.queryByText("a".repeat(64))).not.toBeInTheDocument();
  });
});
