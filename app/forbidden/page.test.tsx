// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";

import ForbiddenPage from "@/app/forbidden/page";

describe("forbidden page", () => {
  it("offers an accessible explanation and safe navigation", () => {
    render(<ForbiddenPage />);

    expect(
      screen.getByRole("heading", { name: "ไม่มีสิทธิ์เข้าถึง" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "กลับหน้าหลัก" }),
    ).toHaveAttribute("href", "/");
  });
});
