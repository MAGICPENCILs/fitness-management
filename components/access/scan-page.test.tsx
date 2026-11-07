// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ScanPage } from "@/components/access/scan-page";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("renders scanned member photos directly without an optimizer cache or srcset", async () => {
  const photoUrl = `/member-photos/${"b".repeat(64)}.png`;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({
    result: "APPROVED", member: { memberCode: "M7", firstName: "Test", lastName: "Member", photoUrl, expireDate: "2026-12-31", daysLeft: 30 },
  }) })));
  render(<ScanPage hardwareHealth={{ mode: "disabled", ready: false }} />);
  fireEvent.change(screen.getByPlaceholderText("รหัสบัตร เช่น C001"), { target: { value: "C001" } });
  fireEvent.click(screen.getByRole("button", { name: /^สแกน$/ }));
  const photo = await screen.findByRole("img", { name: "รูปสมาชิก Test Member" });
  expect(photo).toHaveAttribute("src", photoUrl);
  expect(photo).not.toHaveAttribute("srcset");
});
