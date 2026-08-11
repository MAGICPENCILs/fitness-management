// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

import { StaffSwitcher } from "@/components/staff-switcher";

beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    setPointerCapture: { configurable: true, value: () => undefined },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
  });
});
afterAll(() => {
  delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const options = [
  {
    id: 1,
    staffCode: "OWNER001",
    displayName: "เจ้าของ ระบบ",
    role: "OWNER" as const,
    branchName: "สำนักงานใหญ่",
  },
  {
    id: 3,
    staffCode: "COUNTER003",
    displayName: "เคาน์เตอร์ สาม",
    role: "COUNTER" as const,
    branchName: "สาขาสอง",
  },
];

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

it("refreshes server state after the rotated auth cookie succeeds", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }));
  const user = userEvent.setup();
  render(<StaffSwitcher staff={options} currentStaffId={1} />);

  await user.click(screen.getByRole("combobox"));
  await user.click(screen.getByRole("option", { name: /เคาน์เตอร์ สาม/ }));

  await waitFor(() => expect(navigation.refresh).toHaveBeenCalledOnce());
  expect(fetch).toHaveBeenCalledWith("/api/staff/select", expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ staffId: 3 }),
  }));
});

it("shows fixed generic copy without rendering a malicious route error", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(
    JSON.stringify({ error: "token=raw-session-token 203.0.113.24" }),
    { status: 500 },
  ));
  const user = userEvent.setup();
  render(<StaffSwitcher staff={options} currentStaffId={1} />);

  await user.click(screen.getByRole("combobox"));
  await user.click(screen.getByRole("option", { name: /เคาน์เตอร์ สาม/ }));

  await waitFor(() => expect(screen.getByText(/ไม่สามารถเปลี่ยนบัญชีพนักงานได้/)).toBeVisible());
  expect(screen.queryByText(/raw-session-token|203\.0\.113\.24/)).not.toBeInTheDocument();
  expect(navigation.refresh).not.toHaveBeenCalled();
});
