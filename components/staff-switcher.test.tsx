// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { StaffSwitcher } from "@/components/staff-switcher";

afterEach(cleanup);

it("ระบุชัดว่าเป็น development identity simulation", () => {
  render(
    <StaffSwitcher
      staff={[
        {
          id: 1,
          staffCode: "OWNER001",
          displayName: "สมชาย ใจดี",
          role: "OWNER",
          branchName: "สำนักงานใหญ่",
        },
      ]}
      currentStaffId={1}
    />,
  );

  expect(screen.getByText("โหมดจำลอง Development")).toBeVisible();
  expect(screen.getByLabelText("เลือกบัญชีพนักงานจำลอง")).toBeVisible();
});
