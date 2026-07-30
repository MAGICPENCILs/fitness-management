// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import {
  PrivacyFeedback,
  PrivacyManager,
} from "@/components/privacy/privacy-manager";
import {
  ownerPermissions,
  pendingRequest,
} from "@/components/privacy/privacy-fixtures.test";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

it("ยังไม่ให้อนุมัติจนกว่าจะพิมพ์ ANONYMIZE", async () => {
  const user = userEvent.setup();
  render(
    <PrivacyManager
      requests={[pendingRequest]}
      permissions={ownerPermissions}
    />,
  );
  await user.click(screen.getByRole("button", { name: "ตรวจคำขอ" }));
  const approve = screen.getByRole("button", {
    name: "อนุมัติและทำข้อมูลนิรนาม",
  });
  expect(approve).toBeDisabled();
  await user.type(screen.getByLabelText("ข้อความยืนยัน"), "ANONYMIZE");
  expect(approve).toBeEnabled();
});

it("ประกาศ API error เป็น alert", () => {
  render(
    <PrivacyFeedback type="error" message="ไม่สามารถอนุมัติคำขอได้" />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "ไม่สามารถอนุมัติคำขอได้",
  );
});
