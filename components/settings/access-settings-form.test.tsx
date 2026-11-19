// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AccessSettingsForm } from "./access-settings-form";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); refresh.mockReset(); });

it("บันทึก Grace Period ที่แก้ไขแล้วและแสดงผลสำเร็จ", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
    message: "บันทึกการตั้งค่าแล้ว",
    settings: { id: 1, graceDays: 5 },
  }), { status: 200, headers: { "content-type": "application/json" } }));
  const user = userEvent.setup();
  render(<AccessSettingsForm initialGraceDays={3} />);

  const input = screen.getByLabelText("Grace Period หลังหมดอายุ (วัน)");
  await user.clear(input);
  await user.type(input, "5");
  await user.click(screen.getByRole("button", { name: "บันทึกการตั้งค่า" }));

  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(fetchMock).toHaveBeenCalledWith("/api/access-settings", expect.objectContaining({
    method: "PATCH",
    body: JSON.stringify({ graceDays: 5 }),
  }));
  expect(screen.getByRole("status")).toHaveTextContent("บันทึกการตั้งค่าแล้ว");
});
