// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Member } from "@/db/schema";
import { MemberDetail } from "@/components/members/member-detail";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), fetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
// eslint-disable-next-line @next/next/no-img-element -- จำลอง image optimizer เพื่อทดสอบ URL ที่ component เลือกแสดงเท่านั้น
vi.mock("next/image", () => ({ default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} /> }));

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
  vi.stubGlobal("fetch", mocks.fetch);
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
  expect(screen.getByRole("img", { name: "รูปสมาชิก Test Member" })).toHaveAttribute("src", "/uploads/members/old.png");
  expect(screen.getByRole("button", { name: "อัปโหลดรูปสมาชิก" })).toBeDisabled();
  resolve({ ok: true, json: async () => ({ url: "/uploads/members/new.png" }) });
  await waitFor(() => expect(screen.getByRole("img", { name: "รูปสมาชิก Test Member" })).toHaveAttribute("src", "/uploads/members/new.png"));
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
  expect(screen.getByRole("img", { name: "รูปสมาชิก Test Member" })).toHaveAttribute("src", "/uploads/members/old.png");
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
