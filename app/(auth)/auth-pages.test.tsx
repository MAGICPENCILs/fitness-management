// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOptionalSession: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/auth/session-service", () => ({
  getOptionalSession: mocks.getOptionalSession,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  useRouter: () => ({ replace: vi.fn() }),
}));

import ChangePasswordPage from "@/app/(auth)/change-password/page";
import LoginPage from "@/app/(auth)/login/page";

afterEach(cleanup);

/** สร้าง authoritative session จำลองเฉพาะ field ที่ auth pages ใช้ตัดสิน route */
function session(mode: "FULL" | "PASSWORD_CHANGE_REQUIRED") {
  return {
    authSessionId: 1,
    staffId: 1,
    staffCode: "OWNER001",
    firstName: "สมชาย",
    lastName: "ใจดี",
    role: "OWNER" as const,
    homeBranchId: 1,
    branchName: "สำนักงานใหญ่",
    mode,
  };
}

describe("auth page authoritative routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ให้ invalid, revoked หรือ stale session อยู่หน้า login และ normalize returnTo", async () => {
    mocks.getOptionalSession.mockResolvedValue(null);

    render(
      await LoginPage({
        searchParams: Promise.resolve({ returnTo: "https://evil.example/path" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "เข้าสู่ระบบ" })).toBeVisible();
    expect(screen.getByTestId("login-return-to")).toHaveValue("/");
  });

  it("ส่ง FULL session จาก login ไปหน้าหลัก", async () => {
    mocks.getOptionalSession.mockResolvedValue(session("FULL"));
    await expect(
      LoginPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("REDIRECT:/");
  });

  it("ส่ง forced session จาก login ไป change-password", async () => {
    mocks.getOptionalSession.mockResolvedValue(
      session("PASSWORD_CHANGE_REQUIRED"),
    );
    await expect(
      LoginPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("REDIRECT:/change-password");
  });

  it("ให้ forced session อยู่ change-password และไม่มี Sidebar", async () => {
    mocks.getOptionalSession.mockResolvedValue(
      session("PASSWORD_CHANGE_REQUIRED"),
    );
    render(await ChangePasswordPage());

    expect(
      screen.getByRole("heading", { name: "ตั้งรหัสผ่านใหม่" }),
    ).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "เมนูหลัก" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ออกจากระบบ" })).toBeVisible();
  });

  it("ส่ง FULL session จาก change-password ไปหน้าหลัก", async () => {
    mocks.getOptionalSession.mockResolvedValue(session("FULL"));
    await expect(ChangePasswordPage()).rejects.toThrow("REDIRECT:/");
  });

  it("ส่ง invalid session จาก change-password ไป login", async () => {
    mocks.getOptionalSession.mockResolvedValue(null);
    await expect(ChangePasswordPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("ปล่อย database error จาก auth pages เพื่อให้ Next.js ตอบ 500", async () => {
    const failure = new Error("database unavailable");
    mocks.getOptionalSession.mockRejectedValue(failure);

    await expect(
      LoginPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toBe(failure);
    await expect(ChangePasswordPage()).rejects.toBe(failure);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
