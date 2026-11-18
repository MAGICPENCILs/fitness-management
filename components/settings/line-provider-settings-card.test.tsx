// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LineProviderSettingsDto } from "@/lib/line-provider-settings-service";
import { LineProviderSettingsCard } from "./line-provider-settings-card";

const initial: LineProviderSettingsDto = {
  source: "DATABASE", revision: 3, destination: "U" + "a".repeat(32), outboundEnabled: false,
  accessTokenConfigured: false, channelSecretConfigured: true, updatedAt: null,
  webhookUrl: "https://gym.example/api/line/webhook",
};
const request = vi.fn<typeof fetch>();
const token = () => screen.getByLabelText("Channel Access Token");
const secret = () => screen.getByLabelText("Channel Secret");
const save = () => fireEvent.click(screen.getByRole("button", { name: "บันทึกการตั้งค่า LINE" }));
const enter = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });
beforeEach(() => { vi.stubGlobal("fetch", request); request.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("ฟอร์มก่อนโหลด JavaScript รับค่าลับไม่ได้ และหลัง hydrate กด Enter เพื่อ PATCH ได้", async () => {
  const container = document.createElement("div");
  const card = <LineProviderSettingsCard initial={initial} />;
  container.innerHTML = renderToString(card);
  const server = within(container);
  expect(server.getByLabelText("Channel Access Token")).toBeDisabled();
  expect(server.getByLabelText("Channel Secret")).toBeDisabled();
  expect(server.getByRole("button", { name: "บันทึกการตั้งค่า LINE" })).toBeDisabled();
  expect(container.querySelector("noscript")).toHaveTextContent(/JavaScript/);
  expect([...new FormData(container.querySelector("form")!).keys()]).toEqual([]);

  render(card, { container: document.body.appendChild(container), hydrate: true });
  expect(token()).toBeEnabled();
  request.mockResolvedValueOnce(Response.json({ ...initial, revision: 4 }));
  await userEvent.setup().type(token(), "new-token{Enter}");
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][1]?.method).toBe("PATCH");
  expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({ revision: 3, accessToken: "new-token" });
});

it("แสดงแค่สถานะและช่องลับว่างที่มีคำอธิบาย โดยไม่ให้ native form ส่งค่าผ่าน URL", () => {
  render(<LineProviderSettingsCard initial={initial} />);
  for (const field of [token(), secret()]) {
    expect(field).toHaveValue("");
    expect(field).toHaveAttribute("type", "password");
    expect(field).toHaveAccessibleDescription(/เว้นว่าง/);
  }
  expect(secret()).toHaveAccessibleDescription(/ตั้งค่าแล้ว/);
  expect(token()).toHaveAccessibleDescription(/ยังไม่ตั้งค่า/);
  expect(token().closest("form")).toHaveAttribute("method", "post");
  expect(screen.getByText(/การส่ง LINE ยังปิด/)).toBeInTheDocument();
});

it("ส่งเฉพาะค่าที่แทนที่ ปิดฟอร์มระหว่างรอ ล้างช่องลับ และใช้ revision ใหม่ในครั้งต่อไป", async () => {
  let finish!: (r: Response) => void;
  request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(<LineProviderSettingsCard initial={initial} />);
  enter(token(), "replacement");
  save();
  expect(token().closest("form")).toHaveAttribute("aria-busy", "true");
  expect(token()).toBeDisabled();
  expect(request.mock.calls[0][0]).toBe("/api/notification-provider-settings");
  expect(request.mock.calls[0][1]?.method).toBe("PATCH");
  expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({ revision: 3, accessToken: "replacement" });
  finish(Response.json({ ...initial, revision: 4, accessTokenConfigured: true }));
  await waitFor(() => expect(token()).toBeEnabled());
  expect(token()).toHaveValue("");
  expect(token()).toHaveAccessibleDescription(/ตั้งค่าแล้ว/);
  expect(screen.getByRole("status")).toHaveTextContent(/บันทึก.*แล้ว/);
  request.mockResolvedValueOnce(Response.json({ ...initial, revision: 5 }));
  const next = "U" + "b".repeat(32);
  enter(screen.getByLabelText(/Destination/), next);
  save();
  await waitFor(() => expect(token()).toBeEnabled());
  expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual({ revision: 4, destination: next });
});

it("ต้องยืนยันการล้างทีละค่า และใช้ตัวเลือกแทนที่หรือล้างทั้งคู่เมื่อบันทึกจาก env ครั้งแรก", async () => {
  render(<LineProviderSettingsCard initial={{ ...initial, source: "ENVIRONMENT", revision: 0 }} />);
  enter(token(), "not-imported");
  save();
  expect(request).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(/ครั้งแรก/);
  expect(token()).toHaveValue("");
  expect(secret()).toHaveAttribute("aria-invalid", "true");
  expect(secret()).toHaveAccessibleDescription(/การบันทึกครั้งแรก/);
  const clear = screen.getByRole("button", { name: "ล้าง Channel Secret" });
  expect(clear).toHaveClass("w-full", "whitespace-normal", "min-h-11");
  clear.focus();
  fireEvent.click(clear);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "ยกเลิก" }));
  await waitFor(() => expect(clear).toHaveFocus());
  expect(secret()).toBeEnabled();
  fireEvent.click(clear);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "ยืนยันการล้าง" }));
  expect(secret()).toBeDisabled();
  expect(request).not.toHaveBeenCalled();
  enter(token(), "new-token");
  request.mockResolvedValueOnce(Response.json({ ...initial, revision: 1, accessTokenConfigured: true, channelSecretConfigured: false }));
  save();
  await waitFor(() => expect(secret()).toBeEnabled());
  expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({
    revision: 0, destination: initial.destination, accessToken: "new-token", clearChannelSecret: true,
  });
  expect(secret()).toHaveAccessibleDescription(/ยังไม่ตั้งค่า/);
});

it.each([409, 503])("ไม่สะท้อนข้อความ server %s หรือเก็บค่าลับหลังบันทึกล้มเหลว", async (status) => {
  request.mockResolvedValueOnce(Response.json({ error: "private-error-body" }, { status }));
  render(<LineProviderSettingsCard initial={initial} />);
  enter(token(), "replacement");
  enter(secret(), "other");
  save();
  expect(await screen.findByRole("alert")).toHaveTextContent(status === 409 ? /โหลดหน้าใหม่/ : /ลองใหม่/);
  expect(screen.queryByText("กำลังบันทึกการตั้งค่า LINE")).not.toBeInTheDocument();
  expect(document.body).not.toHaveTextContent("private-error-body");
  expect(token()).toHaveValue("");
  expect(secret()).toHaveValue("");
});

it("ระบุช่อง Destination ที่ผิดและแจ้งให้ยืนยันการล้างอีกครั้งโดยไม่ส่งคำขอ", async () => {
  render(<LineProviderSettingsCard initial={initial} />);
  fireEvent.click(screen.getByRole("button", { name: "ล้าง Channel Access Token" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "ยืนยันการล้าง" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "ยกเลิกการล้าง Channel Access Token" })).toHaveFocus());
  expect(token()).toBeDisabled();
  const destination = screen.getByLabelText(/Destination/);
  enter(destination, "incorrect");
  enter(secret(), "replacement");
  save();
  expect(request).not.toHaveBeenCalled();
  expect(destination).toHaveAttribute("aria-invalid", "true");
  expect(destination).toHaveAccessibleDescription(/ตรวจสอบ Destination/);
  expect(destination).toHaveFocus();
  expect(secret()).toHaveValue("");
  expect(token()).toBeEnabled();
  expect(screen.getByRole("alert")).toHaveTextContent(/ยกเลิก.*การล้าง.*ยืนยัน.*อีกครั้ง/);
});

it("ยกเลิกการล้างก่อนบันทึกแล้วคงค่าทั้งสองไว้", async () => {
  render(<LineProviderSettingsCard initial={initial} />);
  fireEvent.click(screen.getByRole("button", { name: "ล้าง Channel Secret" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "ยืนยันการล้าง" }));
  const undo = screen.getByRole("button", { name: "ยกเลิกการล้าง Channel Secret" });
  await waitFor(() => expect(undo).toHaveFocus());
  expect(undo).toHaveClass("w-full", "whitespace-normal", "min-h-11");
  fireEvent.click(undo);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(secret()).toBeEnabled();
  save();
  expect(request).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent(/ไม่มีการเปลี่ยนแปลง/);
});

it.each([true, false])("คัดลอก URL ที่ตั้งไว้หรือเลือกข้อความให้คัดลอกเอง เมื่อ clipboard ใช้ได้=%s", async (available) => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: available ? { writeText } : undefined });
  try {
    render(<LineProviderSettingsCard initial={initial} />);
    const url = screen.getByLabelText("Webhook URL") as HTMLInputElement;
    expect(url).toHaveValue(initial.webhookUrl);
    expect(url).toHaveAttribute("readonly");
    fireEvent.click(screen.getByRole("button", { name: /คัดลอก URL/ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(available ? /คัดลอก.*แล้ว/ : /คัดลอก.*ด้วยตนเอง/));
    if (available) expect(writeText).toHaveBeenCalledWith(initial.webhookUrl);
    else {
      expect(url).toHaveFocus();
      expect(url.selectionStart).toBe(0);
      expect(url.selectionEnd).toBe(initial.webhookUrl.length);
    }
  } finally {
    if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});
