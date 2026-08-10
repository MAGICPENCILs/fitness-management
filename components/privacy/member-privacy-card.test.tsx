// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MemberPrivacyCard } from "@/components/privacy/member-privacy-card";
import { consentSnapshot } from "@/components/privacy/privacy-fixtures.test";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

it("แสดง consent ครบสามประเภท", () => {
  render(
    <MemberPrivacyCard
      memberId={1}
      snapshot={consentSnapshot}
      canManage
    />,
  );
  expect(screen.getByText("การใช้ข้อมูลเพื่อให้บริการ")).toBeInTheDocument();
  expect(screen.getByText("การตลาด")).toBeInTheDocument();
  expect(screen.getByText("รูปถ่ายสมาชิก")).toBeInTheDocument();
});
