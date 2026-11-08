// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Member } from "@/db/schema";
import { MemberDetail } from "@/components/members/member-detail";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), fetch: vi.fn(), lineFetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

const member: Member = {
  id: 7, homeBranchId: 10, memberCode: "PRIVATE_MEMBER_CODE", firstName: "Test", lastName: "Member",
  phone: null, email: null, address: null, note: null, gender: null, birthDate: null,
  idCard: null, photoUrl: "/uploads/members/old.png", status: "ACTIVE", createdAt: null, updatedAt: null,
};

/** แสดง component จริงเพื่อจับการส่ง PATCH ซ้ำหรือ preview รูปที่ server ยังไม่รับ */
function mount(status: Member["status"] = "ACTIVE") {
  return render(<MemberDetail member={{ ...member, status }} packages={[]} assignedCard={null} availableCards={[]} privacySnapshot={{ PHOTO: null, SERVICE_PRIVACY: null, MARKETING: null }} canManagePrivacy={false} />);
}

/** จำลองการเลือกไฟล์ผ่าน input จริงโดยไม่ใช้ FileReader preview */
function selectFile(container: HTMLElement) {
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["image"], "photo.png", { type: "image/png" })] } });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.lineFetch.mockResolvedValue({ ok: true, json: async () => ({ status: "UNLINKED", challengeExpiresAt: null, linkedAt: null }) });
  vi.stubGlobal("fetch", (url: string, options?: RequestInit) => url.endsWith("/line-link") ? mocks.lineFetch(url, options) : mocks.fetch(url, options));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("sends only memberId/file once and displays server URL only after successful upload", async () => {
  let resolve!: (value: unknown) => void;
  mocks.fetch.mockReturnValue(new Promise((done) => { resolve = done; }));
  const { container } = mount();
  selectFile(container);
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  const [url, options] = mocks.fetch.mock.calls[0];
  expect(url).toBe("/api/upload"); expect(options.method).toBe("POST");
  expect(Array.from((options.body as FormData).keys())).toEqual(["file", "memberId"]);
  expect(options.body.get("memberId")).toBe("7");
  expect(options.body.get("memberCode")).toBeNull();
  expect(screen.getByRole("img", { name: "รูปสมาชิก Test Member" })).toHaveAttribute("src", "/member-photos/by-member/7");
  expect(screen.getByRole("button", { name: "อัปโหลดรูปสมาชิก" })).toBeDisabled();
  const uploadedUrl = `/member-photos/${"a".repeat(64)}.png`;
  resolve({ ok: true, json: async () => ({ url: uploadedUrl }) });
  await waitFor(() => expect(screen.getByRole("img", { name: "รูปสมาชิก Test Member" })).toHaveAttribute("src", "/member-photos/by-member/7"));
  expect(screen.getByRole("img", { name: "รูปสมาชิก Test Member" })).not.toHaveAttribute("srcset");
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});

it.each(["server", "network", "invalid JSON", "missing URL"])("preserves old image and announces accessible error on %s failure", async (failure) => {
  if (failure === "network") mocks.fetch.mockRejectedValue(new Error("PRIVATE_NETWORK"));
  else mocks.fetch.mockResolvedValue({ ok: failure === "missing URL", json: async () => { if (failure === "invalid JSON") throw new SyntaxError("PRIVATE_BODY"); return failure === "missing URL" ? {} : { error: "ต้องได้รับความยินยอมใช้รูปถ่ายก่อน" }; } });
  const { container } = mount();
  selectFile(container);
  expect(await screen.findByRole("alert")).toHaveTextContent(failure === "server" ? "ต้องได้รับความยินยอมใช้รูปถ่ายก่อน" : "อัปโหลดรูปไม่สำเร็จ");
  expect(screen.getByRole("button", { name: "อัปโหลดรูปสมาชิก" })).toHaveAccessibleDescription(failure === "server" ? "ต้องได้รับความยินยอมใช้รูปถ่ายก่อน" : "อัปโหลดรูปไม่สำเร็จ");
  expect(screen.getByRole("img", { name: "รูปสมาชิก Test Member" })).toHaveAttribute("src", "/member-photos/by-member/7");
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "อัปโหลดรูปสมาชิก" })).toBeEnabled();
});

it("disables photo selection for cancelled members", () => {
  const { container } = mount("CANCELLED");
  expect(screen.getByRole("button", { name: "อัปโหลดรูปสมาชิก" })).toBeDisabled();
  expect(container.querySelector('input[type="file"]')).toBeDisabled();
  selectFile(container);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("clears an uploaded preview when refreshed photoUrl becomes null", async () => {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ url: `/member-photos/${"a".repeat(64)}.png` }) });
  const view = mount();
  selectFile(view.container);
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  view.rerender(<MemberDetail member={{ ...member, photoUrl: null }} packages={[]} assignedCard={null} availableCards={[]} privacySnapshot={{ PHOTO: null, SERVICE_PRIVACY: null, MARKETING: null }} canManagePrivacy={false} />);
  expect(screen.queryByRole("img", { name: "รูปสมาชิก Test Member" })).not.toBeInTheDocument();
});

it("shows the gateway immediately after the first upload with no prior photo", async () => {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ url: `/member-photos/${"a".repeat(64)}.png` }) });
  const view = render(<MemberDetail member={{ ...member, photoUrl: null }} packages={[]} assignedCard={null} availableCards={[]} privacySnapshot={{ PHOTO: null, SERVICE_PRIVACY: null, MARKETING: null }} canManagePrivacy={false} />);
  selectFile(view.container);
  expect(await screen.findByRole("img", { name: "รูปสมาชิก Test Member" })).toHaveAttribute("src", "/member-photos/by-member/7");
});

it("clears a first-upload preview when a refreshed member still has no photo reference", async () => {
  const props = { packages: [], assignedCard: null, availableCards: [], privacySnapshot: { PHOTO: null, SERVICE_PRIVACY: null, MARKETING: null }, canManagePrivacy: false };
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ url: `/member-photos/${"a".repeat(64)}.png` }) });
  const view = render(<MemberDetail {...props} member={{ ...member, photoUrl: null }} />);
  selectFile(view.container);
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(screen.getByRole("img", { name: "รูปสมาชิก Test Member" })).toBeInTheDocument();
  view.rerender(<MemberDetail {...props} member={{ ...member, photoUrl: null }} />);
  expect(screen.queryByRole("img", { name: "รูปสมาชิก Test Member" })).not.toBeInTheDocument();
});

it("composes LINE status for member-management staff without requiring privacy-management permission", async () => {
  mount();
  expect(await screen.findByRole("region", { name: "การเชื่อมต่อ LINE" })).toBeInTheDocument();
  expect(await screen.findByText("ยังไม่เชื่อมต่อ")).toBeInTheDocument();
  expect(mocks.lineFetch).toHaveBeenCalledWith("/api/members/7/line-link", { method: "GET", cache: "no-store" });
});

it("clears the issued LINE command when a refreshed privacy snapshot withdraws service consent", async () => {
  const privacySnapshot = { PHOTO: null, MARKETING: null, SERVICE_PRIVACY: { granted: true, policyVersion: "2026-01", updatedAt: "2026-11-08T08:00:00.000Z", actorName: "Staff" } };
  const props = { packages: [], assignedCard: null, availableCards: [], canManagePrivacy: false };
  const command = `LINK ${"a".repeat(43)}`;
  mocks.lineFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "UNLINKED", challengeExpiresAt: null, linkedAt: null }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ status: "PENDING", challengeExpiresAt: "2026-11-08T10:15:00.000Z", linkedAt: null, command }) });
  const view = render(<MemberDetail {...props} member={member} privacySnapshot={privacySnapshot} />);
  fireEvent.click(await screen.findByRole("button", { name: "สร้างคำสั่งเชื่อมต่อ" }));
  expect(await screen.findByText(command)).toBeInTheDocument();
  view.rerender(<MemberDetail {...props} member={{ ...member, status: "SUSPENDED" }} privacySnapshot={{ ...privacySnapshot, SERVICE_PRIVACY: { ...privacySnapshot.SERVICE_PRIVACY, granted: false, updatedAt: "2026-11-08T09:00:00.000Z" } }} />);
  expect(screen.queryByText(command)).not.toBeInTheDocument();
  expect(await screen.findByText("ยังไม่เชื่อมต่อ")).toBeInTheDocument();
});
