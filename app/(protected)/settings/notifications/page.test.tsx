// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import NotificationsPage from "./page";

const { authorize, readProvider } = vi.hoisted(() => ({ authorize: vi.fn(), readProvider: vi.fn() }));
vi.mock("@/lib/staff-service", () => ({ requirePermission: authorize }));
vi.mock("@/lib/branch-service", () => ({ getCurrentBranchId: () => 1 }));
vi.mock("@/lib/line-provider-settings-service", () => ({ getLineProviderSettingsDto: readProvider }));
vi.mock("@/lib/notification-engine", () => ({
  getNotificationSettings: () => ({}), getNotificationHistory: () => [],
  getNotificationProviderHealth: () => ({ line: "UNAVAILABLE" }),
}));
vi.mock("@/components/settings/notification-manager", () => ({
  NotificationManager: (props: object) => <output aria-label="ข้อมูลหน้ากฎ">{JSON.stringify(props)}</output>,
}));
const owner = { staffId: 1, role: "OWNER", homeBranchId: 1 };
const destination = "U" + "1".repeat(32);
beforeEach(() => {
  authorize.mockResolvedValue(owner);
  readProvider.mockResolvedValue({ source: "DATABASE", revision: 1, destination,
    accessTokenConfigured: true, channelSecretConfigured: false, updatedAt: null,
    outboundEnabled: false, webhookUrl: "https://gym.example/api/line/webhook" });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("โหลดสถานะผู้ให้บริการให้เจ้าของเท่านั้น", async () => {
  render(await NotificationsPage());
  expect(screen.getByDisplayValue(destination)).toBeInTheDocument();
  expect(readProvider).toHaveBeenCalledWith(owner);
});

it("เมื่อหน้าได้รับข้อมูลใหม่ ให้ทิ้งค่าที่ยังไม่ได้ส่ง แสดงสถานะล่าสุด และใช้ revision ล่าสุด", async () => {
  const page = render(await NotificationsPage());
  const token = () => screen.getByLabelText("Channel Access Token");
  fireEvent.change(token(), { target: { value: "unsaved" } });
  const fresh = { source: "DATABASE", revision: 2, destination, accessTokenConfigured: false,
    channelSecretConfigured: false, updatedAt: null, outboundEnabled: false, webhookUrl: "https://gym.example/api/line/webhook" };
  readProvider.mockResolvedValue(fresh);
  page.rerender(await NotificationsPage());
  expect(token()).toHaveValue("");
  expect(token()).toHaveAccessibleDescription(/ยังไม่ตั้งค่า/);
  const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ...fresh, revision: 3, accessTokenConfigured: true }));
  vi.stubGlobal("fetch", request);
  fireEvent.change(token(), { target: { value: "replacement" } });
  fireEvent.click(screen.getByRole("button", { name: "บันทึกการตั้งค่า LINE" }));
  await waitFor(() => expect(token()).toHaveValue(""));
  expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({ revision: 2, accessToken: "replacement" });
});

it("ผู้จัดการเห็นสถานะการส่งเดิมโดยไม่โหลดหรือส่งข้อมูลผู้ให้บริการเข้า client props", async () => {
  authorize.mockResolvedValue({ ...owner, role: "MANAGER" });
  render(await NotificationsPage());
  expect(authorize).toHaveBeenCalledWith("settings.manage", 1);
  expect(readProvider).not.toHaveBeenCalled();
  expect(screen.getByLabelText("ข้อมูลหน้ากฎ")).toHaveTextContent("UNAVAILABLE");
  expect(screen.getByLabelText("ข้อมูลหน้ากฎ")).not.toHaveTextContent(/destination|accessTokenConfigured|channelSecretConfigured|webhookUrl/);
  expect(screen.queryByLabelText(/Destination/)).toBeNull();
});

it("ถ้าโหลดสถานะไม่ได้ให้แจ้งเจ้าของโดยไม่แสดงฟอร์มหรือรายละเอียดข้อผิดพลาด", async () => {
  readProvider.mockRejectedValue(new Error("private-driver-detail"));
  render(await NotificationsPage());
  expect(screen.getByRole("alert")).toHaveTextContent(/LINE.*ไม่พร้อม/);
  expect(document.body).not.toHaveTextContent("private-driver-detail");
  expect(screen.queryByLabelText(/Destination/)).toBeNull();
  expect(screen.getByLabelText("ข้อมูลหน้ากฎ")).toBeInTheDocument();
});
