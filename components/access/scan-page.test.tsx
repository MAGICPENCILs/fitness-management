// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ScanPage } from "@/components/access/scan-page";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("renders scanned member photos directly without an optimizer cache or srcset", async () => {
  const photoUrl = `/member-photos/${"b".repeat(64)}.png`;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({
    result: "APPROVED", member: { id: 7, memberCode: "M7", firstName: "Test", lastName: "Member", photoUrl, expireDate: "2026-12-31", daysLeft: 30 },
  }) })));
  render(<ScanPage hardwareHealth={{ mode: "disabled", ready: false }} />);
  fireEvent.change(screen.getByPlaceholderText("รหัสบัตร เช่น C001"), { target: { value: "C001" } });
  fireEvent.click(screen.getByRole("button", { name: /^สแกน$/ }));
  const photo = await screen.findByRole("img", { name: "รูปสมาชิก Test Member" });
  expect(photo).toHaveAttribute("src", "/member-photos/by-member/7");
  expect(photo).not.toHaveAttribute("srcset");
});

it("remounts the protected image when the same member is scanned with a changed photo reference", async () => {
  const member = { id: 7, memberCode: "M7", firstName: "Test", lastName: "Member", expireDate: "2026-12-31", daysLeft: 30 };
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ result: "APPROVED", member: { ...member, photoUrl: `/member-photos/${"a".repeat(64)}.png` } }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ result: "APPROVED", member: { ...member, photoUrl: `/member-photos/${"b".repeat(64)}.png` } }) }));
  render(<ScanPage hardwareHealth={{ mode: "disabled", ready: false }} />);
  fireEvent.change(screen.getByPlaceholderText("รหัสบัตร เช่น C001"), { target: { value: "C001" } });
  const scan = screen.getByRole("button", { name: /^สแกน$/ });
  fireEvent.click(scan);
  const firstPhoto = await screen.findByRole("img", { name: "รูปสมาชิก Test Member" });
  expect(firstPhoto).toHaveAttribute("src", "/member-photos/by-member/7");
  await waitFor(() => expect(scan).toBeEnabled());
  fireEvent.click(scan);
  await waitFor(() => expect(screen.getByRole("img", { name: "รูปสมาชิก Test Member" })).not.toBe(firstPhoto));
  const refreshedPhoto = screen.getByRole("img", { name: "รูปสมาชิก Test Member" });
  expect(firstPhoto).not.toBeInTheDocument();
  expect(refreshedPhoto).toHaveAttribute("src", "/member-photos/by-member/7");
  expect(refreshedPhoto).not.toHaveAttribute("srcset");
});
