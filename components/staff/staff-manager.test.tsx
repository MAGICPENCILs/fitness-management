// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { StaffManager } from "@/components/staff/staff-manager";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

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
