// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LineLinkCard } from "@/components/members/line-link-card";

const unlinked = { status: "UNLINKED", challengeExpiresAt: null, linkedAt: null };
const pending = { status: "PENDING", challengeExpiresAt: "2026-11-08T10:15:00.000Z", linkedAt: null };
const linked = { status: "LINKED", challengeExpiresAt: null, linkedAt: "2026-11-08T10:00:00.000Z" };
const command = `LINK ${"a".repeat(43)}`;
const fetchMock = vi.fn();

/** จำลองเฉพาะขอบเขต HTTP เพื่อทดสอบ component และ dialog จริงโดยไม่เรียก provider */
function response(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(response(unlinked));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("loads only the status endpoint with no-store and announces loading before enabling actions", async () => {
  let resolve!: (value: unknown) => void;
  fetchMock.mockReturnValue(new Promise(done => { resolve = done; }));
  render(<LineLinkCard memberId={7} />);
  expect(screen.getByRole("status")).toHaveTextContent("กำลังโหลดสถานะ LINE");
  expect(screen.getByRole("button", { name: "รีเฟรชสถานะ LINE" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "สร้างคำสั่งเชื่อมต่อ" })).not.toBeInTheDocument();
  await act(async () => resolve(response(unlinked)));
  expect(await screen.findByText("ยังไม่เชื่อมต่อ")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith("/api/members/7/line-link", { method: "GET", cache: "no-store" });
});

it.each([
  [unlinked, "ยังไม่เชื่อมต่อ", null],
  [pending, "รอสมาชิกยืนยัน", pending.challengeExpiresAt],
  [linked, "เชื่อมต่อแล้ว", linked.linkedAt],
] as const)("renders %s with icon/text, safe timestamps and no identifiers", async (state, label, timestamp) => {
  const secrets = { lineUserId: `U${"b".repeat(32)}`, challengeHash: "c".repeat(64), signature: "PRIVATE_SIGNATURE", command };
  fetchMock.mockResolvedValue(response({ ...state, ...secrets }));
  const { container } = render(<LineLinkCard memberId={7} />);
  expect(await screen.findByText(label)).toBeInTheDocument();
  expect(screen.getByText(label).parentElement?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  for (const secret of Object.values(secrets)) expect(container).not.toHaveTextContent(secret);
  if (timestamp) {
    const time = container.querySelector("time")!;
    expect(time).toHaveAttribute("datetime", timestamp);
    expect(time.textContent).toBe(new Date(timestamp).toLocaleString("th-TH"));
  }
  if (state.status === "LINKED") expect(screen.queryByRole("button", { name: /สร้างคำสั่ง/ })).not.toBeInTheDocument();
});

it("issues an empty POST, copies only the once-only command and discards it on refresh/remount", async () => {
  const user = userEvent.setup();
  const clipboard = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  fetchMock.mockResolvedValueOnce(response(unlinked)).mockResolvedValueOnce(response({ ...pending, command })).mockResolvedValue(response(pending));
  const view = render(<LineLinkCard memberId={7} />);
  await user.click(await screen.findByRole("button", { name: "สร้างคำสั่งเชื่อมต่อ" }));
  expect(await screen.findByText(command)).toBeInTheDocument();
  expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/members/7/line-link", { method: "POST", cache: "no-store" });
  await user.click(screen.getByRole("button", { name: "คัดลอกคำสั่งเชื่อมต่อ LINE" }));
  expect(clipboard).toHaveBeenCalledWith(command);
  expect(screen.getByRole("status")).toHaveTextContent("คัดลอกคำสั่งแล้ว");
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  await user.click(screen.getByRole("button", { name: "รีเฟรชสถานะ LINE" }));
  expect(await screen.findByText("รอสมาชิกยืนยัน")).toBeInTheDocument();
  expect(screen.queryByText(command)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "คัดลอกคำสั่งเชื่อมต่อ LINE" })).not.toBeInTheDocument();
  view.unmount();
  render(<LineLinkCard memberId={7} />);
  expect(await screen.findByText("รอสมาชิกยืนยัน")).toBeInTheDocument();
  expect(screen.queryByText(command)).not.toBeInTheDocument();
});

it.each([pending, linked])("requires confirmation before removing %s and restores keyboard focus on cancel", async state => {
  const user = userEvent.setup();
  fetchMock.mockResolvedValueOnce(response(state)).mockResolvedValue(response(unlinked));
  render(<LineLinkCard memberId={7} />);
  const trigger = await screen.findByRole("button", { name: state.status === "PENDING" ? "ยกเลิกคำสั่ง" : "ยกเลิกการเชื่อมต่อ" });
  await user.click(trigger);
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveAccessibleName("ยืนยันยกเลิกการเชื่อมต่อ LINE");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await user.click(within(dialog).getByRole("button", { name: "กลับ" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await user.keyboard("{Enter}");
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "ยืนยันยกเลิก" }));
  expect(await screen.findByText("ยังไม่เชื่อมต่อ")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenLastCalledWith("/api/members/7/line-link", { method: "DELETE", cache: "no-store" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("ยกเลิกการเชื่อมต่อ LINE แล้ว");
});

it.each(["http", "network", "json"])("recovers from %s load failures without exposing raw errors", async failure => {
  const user = userEvent.setup();
  if (failure === "network") fetchMock.mockRejectedValueOnce(new Error("PRIVATE_ERROR"));
  else if (failure === "json") fetchMock.mockResolvedValueOnce({ ok: true, json: async () => { throw new Error("PRIVATE_ERROR"); } });
  else fetchMock.mockResolvedValueOnce(response({ error: "PRIVATE_ERROR" }, false));
  render(<LineLinkCard memberId={7} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("โหลดสถานะ LINE ไม่สำเร็จ");
  expect(document.body).not.toHaveTextContent("PRIVATE_ERROR");
  expect(screen.queryByRole("button", { name: "สร้างคำสั่งเชื่อมต่อ" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "รีเฟรชสถานะ LINE" }));
  expect(await screen.findByText("ยังไม่เชื่อมต่อ")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("disables mutation controls while issuing, recovers from failure and allows retry", async () => {
  const user = userEvent.setup();
  let resolve!: (value: unknown) => void;
  fetchMock.mockResolvedValueOnce(response(unlinked)).mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValueOnce(response({ ...pending, command }));
  render(<LineLinkCard memberId={7} />);
  await user.click(await screen.findByRole("button", { name: "สร้างคำสั่งเชื่อมต่อ" }));
  expect(screen.getByRole("button", { name: "สร้างคำสั่งเชื่อมต่อ" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "รีเฟรชสถานะ LINE" })).toBeDisabled();
  await act(async () => resolve(response({ error: "PRIVATE_ERROR" }, false)));
  expect(await screen.findByRole("alert")).toHaveTextContent("สร้างคำสั่งไม่สำเร็จ");
  await user.click(screen.getByRole("button", { name: "สร้างคำสั่งเชื่อมต่อ" }));
  expect(await screen.findByText(command)).toBeInTheDocument();
});

it("keeps removal errors in the dialog and blocks dismissal during deletion", async () => {
  const user = userEvent.setup();
  let resolve!: (value: unknown) => void;
  fetchMock.mockResolvedValueOnce(response(linked)).mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValueOnce(response(unlinked));
  render(<LineLinkCard memberId={7} />);
  await user.click(await screen.findByRole("button", { name: "ยกเลิกการเชื่อมต่อ" }));
  await user.click(screen.getByRole("button", { name: "ยืนยันยกเลิก" }));
  expect(screen.getByRole("button", { name: "กลับ" })).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await act(async () => resolve(response({}, false)));
  expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("ยกเลิกการเชื่อมต่อไม่สำเร็จ");
  await user.click(screen.getByRole("button", { name: "ยืนยันยกเลิก" }));
  expect(await screen.findByText("ยังไม่เชื่อมต่อ")).toBeInTheDocument();
});

it("announces clipboard failure and retains the selectable command", async () => {
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("PRIVATE_CLIPBOARD"));
  fetchMock.mockResolvedValueOnce(response(unlinked)).mockResolvedValueOnce(response({ ...pending, command }));
  render(<LineLinkCard memberId={7} />);
  await user.click(await screen.findByRole("button", { name: "สร้างคำสั่งเชื่อมต่อ" }));
  await user.click(await screen.findByRole("button", { name: "คัดลอกคำสั่งเชื่อมต่อ LINE" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("คัดลอกไม่สำเร็จ");
  expect(screen.getByText(command)).toBeInTheDocument();
});

it("wraps long commands, uses semantic surfaces and retains accessible 44px focusable controls", async () => {
  const user = userEvent.setup();
  fetchMock.mockResolvedValueOnce(response(unlinked)).mockResolvedValueOnce(response({ ...pending, command }));
  const { container } = render(<LineLinkCard memberId={7} />);
  await user.click(await screen.findByRole("button", { name: "สร้างคำสั่งเชื่อมต่อ" }));
  const code = await screen.findByText(command);
  expect(code).toHaveClass("break-all", "whitespace-pre-wrap");
  expect(screen.getByRole("region", { name: "การเชื่อมต่อ LINE" })).toHaveClass("min-w-0", "bg-card", "text-card-foreground");
  for (const button of screen.getAllByRole("button")) {
    expect(button.className).toContain("h-11");
    expect(button.className).toContain("focus-visible:ring");
  }
  expect(container.innerHTML).not.toMatch(/w-\[\d+px\]|min-w-\[|whitespace-nowrap[^\"]*font-mono|#[0-9a-fA-F]{6}/);
});

it("discards an old member response after the card unmounts", async () => {
  let resolve!: (value: unknown) => void;
  fetchMock.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const view = render(<LineLinkCard memberId={7} />);
  view.unmount();
  render(<LineLinkCard memberId={8} />);
  expect(await screen.findByText("ยังไม่เชื่อมต่อ")).toBeInTheDocument();
  await act(async () => resolve(response(linked)));
  expect(screen.queryByText("เชื่อมต่อแล้ว")).not.toBeInTheDocument();
});
