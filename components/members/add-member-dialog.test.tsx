// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddMemberDialog } from "./add-member-dialog";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

Object.defineProperties(HTMLElement.prototype, {
  hasPointerCapture: { value: () => false },
  setPointerCapture: { value: () => undefined },
  releasePointerCapture: { value: () => undefined },
  scrollIntoView: { value: () => undefined },
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  navigation.refresh.mockReset();
  vi.restoreAllMocks();
});

afterEach(() => cleanup());

describe("counter member enrollment", () => {
  it("ขายแพ็กเกจผ่าน payments เพื่อสร้างใบเสร็จแทน endpoint ผูกสิทธิ์โดยตรง", async () => {
    const requests: Array<{ url: string; body?: Record<string, unknown> }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url === "/api/members/next-code") return jsonResponse({ code: "M00001" });
      if (url === "/api/packages") return jsonResponse([{ id: 3, name: "รายเดือน", type: "MONTHLY", durationDays: 30, price: "1000.00" }]);
      if (url === "/api/members") return jsonResponse({ id: 22 }, 201);
      if (url === "/api/payments") return jsonResponse({ id: 9, receiptId: 10, receiptNumber: "REC-10" }, 201);
      return jsonResponse({ error: "ห้ามใช้ endpoint นี้" }, 500);
    });
    const user = userEvent.setup();
    render(<AddMemberDialog />);

    await user.click(screen.getByRole("button", { name: "เพิ่มสมาชิก" }));
    await user.type(await screen.findByLabelText(/ชื่อ \*/), "สมชาย");
    await user.type(screen.getByLabelText(/นามสกุล \*/), "ใจดี");
    await user.click(screen.getByRole("checkbox", { name: /การใช้ข้อมูลเพื่อให้บริการ/ }));
    await user.click(screen.getByRole("combobox", { name: "แพ็กเกจ" }));
    await user.click(screen.getByRole("option", { name: /รายเดือน/ }));

    expect(screen.getByRole("combobox", { name: "ช่องทางชำระเงิน" })).toBeVisible();
    expect(screen.queryByLabelText("ราคาที่ชำระ (บาท)")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "บันทึก" }));

    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledOnce());
    expect(requests.some(request => request.url === "/api/member-packages")).toBe(false);
    expect(requests.find(request => request.url === "/api/payments")?.body).toMatchObject({
      memberId: 22,
      packageId: 3,
      method: "CASH",
    });
  });
});
