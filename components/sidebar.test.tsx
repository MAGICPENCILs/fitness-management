// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

import { Sidebar } from "@/components/sidebar";
import type { Permission } from "@/lib/rbac";

afterEach(cleanup);

const permissions = new Proxy(
  {},
  { get: () => true },
) as Record<Permission, boolean>;
const currentStaff = {
  id: 1,
  staffCode: "OWNER001",
  displayName: "สมชาย ใจดี",
  role: "OWNER" as const,
  branchName: "สำนักงานใหญ่",
};

describe("Sidebar auth controls", () => {
  it("แสดงเมนูความปลอดภัยเฉพาะผู้มี auth.security.read", () => {
    const deniedPermissions = new Proxy(
      {},
      { get: (_target, key) => key !== "auth.security.read" },
    ) as Record<Permission, boolean>;
    const common = {
      branches: [{ id: 1, code: "BKK", name: "สำนักงานใหญ่" }],
      currentBranchId: 1,
      currentStaff,
      availableStaff: [],
      devSwitcherEnabled: false,
    };
    const { rerender } = render(<Sidebar {...common} permissions={deniedPermissions} />);
    expect(screen.queryByRole("link", { name: "ความปลอดภัย" })).not.toBeInTheDocument();
    rerender(<Sidebar {...common} permissions={permissions} />);
    expect(screen.getByRole("link", { name: "ความปลอดภัย" })).toHaveAttribute(
      "href",
      "/settings/security",
    );
  });

  it("ระบุเมนูความปลอดภัยเป็นหน้าปัจจุบันโดยไม่ทำให้เมนูตั้งค่าราก active", () => {
    navigation.pathname = "/settings/security";
    render(
      <Sidebar
        branches={[{ id: 1, code: "BKK", name: "สำนักงานใหญ่" }]}
        currentBranchId={1}
        currentStaff={currentStaff}
        availableStaff={[]}
        devSwitcherEnabled={false}
        permissions={permissions}
      />,
    );
    expect(screen.getByRole("link", { name: "ความปลอดภัย" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "ตั้งค่าระบบ" })).not.toHaveAttribute("aria-current");
    navigation.pathname = "/";
  });

  it("แสดง current staff และ logout ทั้ง mobile/desktop โดยไม่เผยรายชื่อ Staff ปกติ", async () => {
    const user = userEvent.setup();
    render(
      <Sidebar
        branches={[{ id: 1, code: "BKK", name: "สำนักงานใหญ่" }]}
        currentBranchId={1}
        currentStaff={currentStaff}
        availableStaff={[]}
        devSwitcherEnabled={false}
        permissions={permissions}
      />,
    );

    expect(screen.getAllByText("สมชาย ใจดี")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "เปิดเมนูหลัก" }));
    expect(screen.getAllByText("สมชาย ใจดี")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "ออกจากระบบ" })).toHaveLength(1);
    expect(screen.queryByText("โหมดจำลอง Development")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("เลือกบัญชีพนักงานจำลอง")).not.toBeInTheDocument();
  });

  it("แสดง dev switcher และคำเตือนเมื่อ server เปิด flag เท่านั้น", async () => {
    const user = userEvent.setup();
    render(
      <Sidebar
        branches={[{ id: 1, code: "BKK", name: "สำนักงานใหญ่" }]}
        currentBranchId={1}
        currentStaff={currentStaff}
        availableStaff={[currentStaff]}
        devSwitcherEnabled
        permissions={permissions}
      />,
    );

    expect(screen.getAllByText("โหมดจำลอง Development")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "เปิดเมนูหลัก" }));
    expect(screen.getAllByText("โหมดจำลอง Development")).toHaveLength(2);
    expect(screen.getAllByLabelText("เลือกบัญชีพนักงานจำลอง")).toHaveLength(2);
  });
});
