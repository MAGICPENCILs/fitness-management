// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

import { ChangePasswordForm } from "@/components/auth/change-password-form";

afterEach(cleanup);

describe("ChangePasswordForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.replace.mockReset();
  });

  it("แสดงกฎทั้งสี่และใช้ autocomplete สำหรับรหัสผ่านใหม่", () => {
    render(<ChangePasswordForm />);

    expect(
      screen.getByRole("heading", { name: "ตั้งรหัสผ่านใหม่" }),
    ).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("อย่างน้อย 12 ตัวอักษร")).toBeVisible();
    expect(screen.getByText("มีตัวพิมพ์ใหญ่และตัวพิมพ์เล็ก")).toBeVisible();
    expect(screen.getByText("มีตัวเลขอย่างน้อย 1 ตัว")).toBeVisible();
    expect(screen.getByText("มีอักขระพิเศษอย่างน้อย 1 ตัว")).toBeVisible();
    expect(screen.getByLabelText("รหัสผ่านใหม่")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(screen.getByLabelText("ยืนยันรหัสผ่านใหม่")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });

  it("สลับแสดงรหัสผ่านใหม่ด้วย accessible name", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);

    await user.click(
      screen.getByRole("button", { name: "แสดงรหัสผ่านใหม่" }),
    );
    expect(screen.getByLabelText("รหัสผ่านใหม่")).toHaveAttribute(
      "type",
      "text",
    );
    expect(
      screen.getByRole("button", { name: "ซ่อนรหัสผ่านใหม่" }),
    ).toBeVisible();
  });

  it("แจ้ง confirmation mismatch แบบ inline โดยไม่ส่ง request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    render(<ChangePasswordForm />);

    await user.type(screen.getByLabelText("รหัสผ่านใหม่"), "ValidPass#2026");
    await user.type(
      screen.getByLabelText("ยืนยันรหัสผ่านใหม่"),
      "Different#2026",
    );
    await user.click(screen.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" }));

    expect(await screen.findByText("รหัสผ่านยืนยันไม่ตรงกัน")).toBeVisible();
    expect(screen.getByLabelText("ยืนยันรหัสผ่านใหม่")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ปิด controls ระหว่างรอและกลับหน้าหลักเมื่อได้ FULL session", async () => {
    let resolveRequest!: (response: Response) => void;
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<ChangePasswordForm />);

    await user.type(screen.getByLabelText("รหัสผ่านใหม่"), "ValidPass#2026");
    await user.type(
      screen.getByLabelText("ยืนยันรหัสผ่านใหม่"),
      "ValidPass#2026",
    );
    await user.click(screen.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" }));

    expect(
      screen.getByRole("button", { name: "กำลังบันทึกรหัสผ่าน" }),
    ).toBeDisabled();
    expect(screen.getByRole("form", { name: "ตั้งรหัสผ่านใหม่" })).toHaveAttribute(
      "aria-busy",
      "true",
    );

    await act(async () => {
      resolveRequest(
        new Response(JSON.stringify({ returnTo: "/" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
  });

  it("แสดง server error พร้อม recovery และให้ลองใหม่ได้", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "รหัสผ่านไม่เป็นไปตามนโยบาย" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const user = userEvent.setup();
    render(<ChangePasswordForm />);

    await user.type(screen.getByLabelText("รหัสผ่านใหม่"), "ValidPass#2026");
    await user.type(
      screen.getByLabelText("ยืนยันรหัสผ่านใหม่"),
      "ValidPass#2026",
    );
    await user.click(screen.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" }));

    expect(await screen.findByText(/รหัสผ่านไม่เป็นไปตามนโยบาย/)).toBeVisible();
    expect(screen.getByText(/กรุณาลองอีกครั้ง/)).toBeVisible();
    expect(screen.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" })).toBeEnabled();
  });

  it.each([
    { status: 401, destination: "/login" },
    { status: 403, destination: "/" },
  ])(
    "ล้างรหัสผ่านและไป $destination เมื่อ server ตอบ $status",
    async ({ status, destination }) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ error: "เซสชันไม่สามารถใช้งานได้" }), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      );
      const user = userEvent.setup();
      render(<ChangePasswordForm />);
      const password = screen.getByLabelText("รหัสผ่านใหม่");
      const confirmation = screen.getByLabelText("ยืนยันรหัสผ่านใหม่");

      await user.type(password, "ValidPass#2026");
      await user.type(confirmation, "ValidPass#2026");
      await user.click(
        screen.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" }),
      );

      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith(destination),
      );
      expect(password).toHaveValue("");
      expect(confirmation).toHaveValue("");
      expect(screen.queryByText(/กฎทั้งสี่/)).not.toBeInTheDocument();
    },
  );

  it.each([
    {
      name: "invalid JSON",
      response: () => Promise.resolve(new Response("not-json", { status: 500 })),
      secret: "Unexpected token",
    },
    {
      name: "network exception",
      response: () => Promise.reject(new TypeError("database tunnel closed")),
      secret: "database tunnel closed",
    },
  ])("ซ่อนรายละเอียด $name และแสดงข้อความกลาง", async ({ response, secret }) => {
    vi.spyOn(globalThis, "fetch").mockImplementation(response);
    const user = userEvent.setup();
    render(<ChangePasswordForm />);

    await user.type(screen.getByLabelText("รหัสผ่านใหม่"), "ValidPass#2026");
    await user.type(
      screen.getByLabelText("ยืนยันรหัสผ่านใหม่"),
      "ValidPass#2026",
    );
    await user.click(
      screen.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" }),
    );

    expect(
      await screen.findByText(/ไม่สามารถเปลี่ยนรหัสผ่านได้ชั่วคราว/),
    ).toBeVisible();
    expect(screen.queryByText(new RegExp(secret, "i"))).not.toBeInTheDocument();
    expect(screen.queryByText(/กฎทั้งสี่/)).not.toBeInTheDocument();
  });
});
