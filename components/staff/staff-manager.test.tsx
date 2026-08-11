// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StaffManager } from "@/components/staff/staff-manager";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const staffRow = {
  id: 41,
  staffCode: "COUNTER041",
  firstName: "สมชาย",
  lastName: "ใจดี",
  homeBranchId: 2,
  branchName: "สาขา 2",
  role: "COUNTER" as const,
  phone: null,
  email: null,
  status: "ACTIVE" as const,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => cleanup());

Object.defineProperties(HTMLElement.prototype, {
  hasPointerCapture: { value: () => false },
  setPointerCapture: { value: () => undefined },
  releasePointerCapture: { value: () => undefined },
  scrollIntoView: { value: () => undefined },
});

it("ซ่อนบทบาท Owner เมื่อ actor เป็น Manager", async () => {
  const user = userEvent.setup();
  render(
    <StaffManager
      staff={[]}
      branches={[{ id: 2, name: "สาขา 2" }]}
      actor={{ role: "MANAGER", homeBranchId: 2 }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "เพิ่มพนักงาน" }));
  await user.click(screen.getByLabelText("บทบาท"));
  expect(screen.queryByRole("option", { name: "Owner" })).not.toBeInTheDocument();
});

it("แสดง password fields เฉพาะ create พร้อม autocomplete และ show/hide ที่เข้าถึงได้", async () => {
  const user = userEvent.setup();
  render(
    <StaffManager
      staff={[staffRow]}
      branches={[{ id: 2, name: "สาขา 2" }]}
      actor={{ role: "MANAGER", homeBranchId: 2 }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "เพิ่มพนักงาน" }));
  const password = screen.getByLabelText("รหัสผ่านชั่วคราว");
  const confirmation = screen.getByLabelText("ยืนยันรหัสผ่านชั่วคราว");
  expect(password).toHaveAttribute("type", "password");
  expect(password).toHaveAttribute("autocomplete", "new-password");
  expect(confirmation).toHaveAttribute("autocomplete", "new-password");

  await user.click(screen.getByRole("button", { name: "แสดงรหัสผ่านชั่วคราว" }));
  expect(password).toHaveAttribute("type", "text");

  await user.click(screen.getByRole("button", { name: "ยกเลิก" }));
  await user.click(screen.getByRole("button", { name: "แก้ไข สมชาย ใจดี" }));
  expect(screen.queryByLabelText("รหัสผ่านชั่วคราว")).not.toBeInTheDocument();
});

it("reset dialog ยืนยันเป้าหมายและล้าง secret state พร้อมคืน focus เมื่อปิด", async () => {
  const user = userEvent.setup();
  render(
    <StaffManager
      staff={[staffRow]}
      branches={[{ id: 2, name: "สาขา 2" }]}
      actor={{ role: "MANAGER", homeBranchId: 2 }}
    />,
  );
  const trigger = screen.getByRole("button", {
    name: "ตั้งรหัสผ่านใหม่ให้ สมชาย ใจดี",
  });

  await user.click(trigger);
  expect(screen.getByRole("dialog")).toHaveTextContent("สมชาย ใจดี");
  expect(screen.getByRole("dialog")).toHaveTextContent(
    "เซสชันทั้งหมดของบัญชีนี้จะถูกออกจากระบบ",
  );
  await user.type(screen.getByLabelText("รหัสผ่านชั่วคราวใหม่"), "StrongPass#2026");
  await user.type(
    screen.getByLabelText("ยืนยันรหัสผ่านชั่วคราวใหม่"),
    "StrongPass#2026",
  );
  await user.click(screen.getByRole("button", { name: "ยกเลิก" }));
  expect(trigger).toHaveFocus();

  await user.click(trigger);
  expect(screen.getByLabelText("รหัสผ่านชั่วคราวใหม่")).toHaveValue("");
  expect(screen.getByLabelText("ยืนยันรหัสผ่านชั่วคราวใหม่")).toHaveValue("");
});

it("Manager ไม่เห็น reset control ของ Owner แม้อยู่สาขาเดียวกัน", () => {
  render(
    <StaffManager
      staff={[{ ...staffRow, role: "OWNER" }]}
      branches={[{ id: 2, name: "สาขา 2" }]}
      actor={{ role: "MANAGER", homeBranchId: 2 }}
    />,
  );

  expect(
    screen.queryByRole("button", { name: "ตั้งรหัสผ่านใหม่ให้ สมชาย ใจดี" }),
  ).not.toBeInTheDocument();
});

it("ส่ง reset password ไป endpoint เป้าหมายและประกาศ error แบบ aria-live", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ error: "ไม่สามารถตั้งรหัสผ่านได้" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    }),
  );
  render(
    <StaffManager
      staff={[staffRow]}
      branches={[{ id: 2, name: "สาขา 2" }]}
      actor={{ role: "MANAGER", homeBranchId: 2 }}
    />,
  );

  await user.click(
    screen.getByRole("button", { name: "ตั้งรหัสผ่านใหม่ให้ สมชาย ใจดี" }),
  );
  await user.type(screen.getByLabelText("รหัสผ่านชั่วคราวใหม่"), "StrongPass#2026");
  await user.type(
    screen.getByLabelText("ยืนยันรหัสผ่านชั่วคราวใหม่"),
    "StrongPass#2026",
  );
  await user.click(screen.getByRole("button", { name: "ยืนยันการตั้งรหัสผ่าน" }));

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/staff/41/reset-password",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        temporaryPassword: "StrongPass#2026",
        passwordConfirmation: "StrongPass#2026",
      }),
    }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("ไม่สามารถตั้งรหัสผ่านได้");
  expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "polite");
});
