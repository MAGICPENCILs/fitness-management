// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

import { CurrentStaffMenu, LogoutButton } from "@/components/auth/current-staff-menu";

afterEach(cleanup);

const currentStaff = {
  staffCode: "OWNER001",
  displayName: "สมชาย ใจดี",
  role: "OWNER" as const,
  branchName: "สำนักงานใหญ่",
};

describe("CurrentStaffMenu", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.replace.mockReset();
  });

  it("แสดงชื่อ รหัส บทบาท สาขา และปุ่มออกจากระบบ", () => {
    render(<CurrentStaffMenu staff={currentStaff} />);

    expect(screen.getByText("สมชาย ใจดี")).toBeVisible();
    expect(screen.getByText("OWNER001")).toBeVisible();
    expect(screen.getByText("เจ้าของระบบ")).toBeVisible();
    expect(screen.getByText("สำนักงานใหญ่")).toBeVisible();
    expect(screen.getByRole("button", { name: "ออกจากระบบ" })).toBeVisible();
  });

  it("ปิดปุ่มขณะ logout และไปหน้า login เมื่อสำเร็จ", async () => {
    let resolveRequest!: (response: Response) => void;
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<LogoutButton />);

    await user.click(screen.getByRole("button", { name: "ออกจากระบบ" }));
    expect(screen.getByRole("button", { name: "กำลังออกจากระบบ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "กำลังออกจากระบบ" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await act(async () => {
      resolveRequest(
        new Response(JSON.stringify({ message: "ออกจากระบบแล้ว" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
  });

  it("แจ้งข้อผิดพลาดพร้อมทางแก้และเปิดปุ่มให้ลองใหม่", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "ไม่สามารถออกจากระบบได้ชั่วคราว" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
    );
    const user = userEvent.setup();
    render(<LogoutButton />);

    await user.click(screen.getByRole("button", { name: "ออกจากระบบ" }));
    expect(
      await screen.findByText(/ไม่สามารถออกจากระบบได้ชั่วคราว/),
    ).toBeVisible();
    expect(screen.getByText(/กรุณาลองอีกครั้ง/)).toBeVisible();
    expect(screen.getByRole("button", { name: "ออกจากระบบ" })).toBeEnabled();
  });
});
