// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EquipmentManager } from "@/components/equipment/equipment-manager";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => cleanup());

it("แสดงอุปกรณ์ที่เลิกใช้งานโดยไม่เปิดให้ทำรายการปฏิบัติการ", () => {
  render(
    <EquipmentManager
      today="2026-08-21"
      history={[]}
      equipment={[
        {
          id: 1,
          code: "RET-001",
          name: "ลู่วิ่งที่เลิกใช้งาน",
          category: "CARDIO",
          location: "ชั้น 1",
          serialNumber: null,
          status: "RETIRED",
          purchaseDate: null,
          warrantyEndDate: null,
          currentUsageHours: 0,
          maintenanceIntervalHours: null,
          nextMaintenanceHours: null,
          nextMaintenanceDate: null,
          lastMaintenanceDate: null,
          note: null,
          maintenanceState: "NONE",
          remainingHours: null,
          remainingDays: null,
          createdAt: null,
          updatedAt: null,
        },
      ]}
    />,
  );

  expect(screen.getByText("เลิกใช้งาน")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "อัปเดตมิเตอร์" }),
  ).not.toBeInTheDocument();
});
