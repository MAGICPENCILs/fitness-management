// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  locationReplace: vi.fn(),
}));

import { LoginForm } from "@/components/auth/login-form";

afterEach(cleanup);

describe("LoginForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.locationReplace.mockReset();
  });

  it("มี label, autocomplete, focus target และสถานะที่ screen reader รับรู้ได้", () => {
    render(<LoginForm returnTo="/members" />);

    expect(screen.getByRole("heading", { name: "เข้าสู่ระบบ" })).toBeVisible();
    expect(screen.getByLabelText("รหัสพนักงาน")).toHaveAttribute(
      "autocomplete",
      "username",
    );
    expect(screen.getByLabelText("รหัสผ่าน")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เข้าสู่ระบบ" })).toHaveClass(
      "h-12",
    );
  });

  it("สลับแสดงและซ่อนรหัสผ่านด้วยปุ่มที่มี accessible name", async () => {
    const user = userEvent.setup();
    render(<LoginForm returnTo="/" />);
    const password = screen.getByLabelText("รหัสผ่าน");

    expect(password).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "แสดงรหัสผ่าน" }));
    expect(password).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "ซ่อนรหัสผ่าน" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("สั่งแสดงรหัสผ่านด้วย keyboard ได้", async () => {
    const user = userEvent.setup();
    render(<LoginForm returnTo="/" />);
    const toggle = screen.getByRole("button", { name: "แสดงรหัสผ่าน" });

    toggle.focus();
    await user.keyboard("{Enter}");

    expect(screen.getByLabelText("รหัสผ่าน")).toHaveAttribute("type", "text");
    expect(toggle).toHaveFocus();
  });

  it("ส่ง payload ที่กำหนด ปิด controls ระหว่างรอ และไปยัง returnTo ที่ server ตอบ", async () => {
    let resolveRequest!: (response: Response) => void;
    const request = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValue(request);
    const user = userEvent.setup();
    render(
      <LoginForm
        returnTo="/members?tab=active"
        navigateAfterLogin={mocks.locationReplace}
      />,
    );

    await user.type(screen.getByLabelText("รหัสพนักงาน"), "OWNER001");
    await user.type(screen.getByLabelText("รหัสผ่าน"), "ValidPass#2026");
    await user.click(screen.getByRole("button", { name: "เข้าสู่ระบบ" }));

    expect(screen.getByRole("button", { name: "กำลังเข้าสู่ระบบ" })).toBeDisabled();
    expect(screen.getByRole("form", { name: "เข้าสู่ระบบ" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          staffCode: "OWNER001",
          password: "ValidPass#2026",
          returnTo: "/members?tab=active",
        }),
      }),
    );

    await act(async () => {
      resolveRequest(
        new Response(JSON.stringify({ returnTo: "/members?tab=active" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    await waitFor(() =>
      expect(mocks.locationReplace).toHaveBeenCalledWith(
        "/members?tab=active",
      ),
    );
  });

  it("แสดง inline error พร้อมแนวทางแก้และเปิดให้ลองใหม่", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const user = userEvent.setup();
    render(<LoginForm returnTo="/" />);

    await user.type(screen.getByLabelText("รหัสพนักงาน"), "OWNER001");
    await user.type(screen.getByLabelText("รหัสผ่าน"), "wrong");
    await user.click(screen.getByRole("button", { name: "เข้าสู่ระบบ" }));

    expect(
      await screen.findByText(/รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง/),
    ).toBeVisible();
    expect(screen.getByText(/กรุณาตรวจสอบข้อมูลแล้วลองอีกครั้ง/)).toBeVisible();
    expect(screen.getByLabelText("รหัสพนักงาน")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("button", { name: "เข้าสู่ระบบ" })).toBeEnabled();
  });

  it("แสดงข้อผิดพลาด schema ตรงไปตรงมาโดยไม่กล่าวโทษ credential", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "SCHEMA_NOT_READY",
          error: "ฐานข้อมูลระบบยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    const user = userEvent.setup();
    render(<LoginForm returnTo="/" />);

    await user.type(screen.getByLabelText("รหัสพนักงาน"), "OWNER001");
    await user.type(screen.getByLabelText("รหัสผ่าน"), "ValidPass#2026");
    await user.click(screen.getByRole("button", { name: "เข้าสู่ระบบ" }));

    expect(
      await screen.findByText(
        "ฐานข้อมูลระบบยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
      ),
    ).toBeVisible();
    expect(
      screen.queryByText(/กรุณาตรวจสอบข้อมูลแล้วลองอีกครั้ง/),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เข้าสู่ระบบ" })).toBeEnabled();
  });

  it.each([
    {
      name: "invalid JSON",
      response: () =>
        Promise.resolve(
          new Response("<html>upstream failure</html>", { status: 502 }),
        ),
      secret: "Unexpected token",
    },
    {
      name: "network exception",
      response: () => Promise.reject(new TypeError("internal proxy refused")),
      secret: "internal proxy refused",
    },
  ])("ซ่อนรายละเอียด $name และแสดงข้อความกลาง", async ({ response, secret }) => {
    vi.spyOn(globalThis, "fetch").mockImplementation(response);
    const user = userEvent.setup();
    render(<LoginForm returnTo="/" />);

    await user.type(screen.getByLabelText("รหัสพนักงาน"), "OWNER001");
    await user.type(screen.getByLabelText("รหัสผ่าน"), "ValidPass#2026");
    await user.click(screen.getByRole("button", { name: "เข้าสู่ระบบ" }));

    expect(
      await screen.findByText(/ไม่สามารถเข้าสู่ระบบได้ชั่วคราว/),
    ).toBeVisible();
    expect(screen.queryByText(new RegExp(secret, "i"))).not.toBeInTheDocument();
  });
});
