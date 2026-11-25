// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AccessScanPointForm } from "./access-scan-point-form";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockClear(); });

it("บันทึกเฉพาะชื่อจุดและโหลดรายการจากเซิร์ฟเวอร์ใหม่", async () => {
  const request = vi.fn(async () => new Response(null, { status: 201 }));
  vi.stubGlobal("fetch", request);
  render(<AccessScanPointForm points={[{ id: 1, name: "ประตูหน้า" }]} />);
  expect(screen.getByText("ประตูหน้า")).toBeVisible();
  fireEvent.change(screen.getByLabelText("ชื่อจุดสแกน"), { target: { value: "  ห้องโยคะ  " } });
  fireEvent.click(screen.getByRole("button", { name: "เพิ่มจุดสแกน" }));
  expect(await screen.findByRole("status")).toHaveTextContent("เพิ่มจุดสแกนแล้ว");
  expect(request).toHaveBeenCalledWith("/api/access-scan-points", expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "ห้องโยคะ" }) }));
  expect(refresh).toHaveBeenCalledOnce();
});

it("แจ้งชื่อซ้ำและเก็บค่าที่กรอกไว้ให้แก้ไข", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "ชื่อจุดสแกนนี้มีอยู่แล้ว" }, { status: 409 })));
  render(<AccessScanPointForm points={[]} />);
  const input = screen.getByLabelText("ชื่อจุดสแกน");
  fireEvent.change(input, { target: { value: "ประตูหน้า" } });
  fireEvent.click(screen.getByRole("button", { name: "เพิ่มจุดสแกน" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("ชื่อจุดสแกนนี้มีอยู่แล้ว");
  expect(input).toHaveValue("ประตูหน้า");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(refresh).not.toHaveBeenCalled();
});
