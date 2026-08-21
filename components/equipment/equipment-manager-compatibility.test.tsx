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
      canManage
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
          maintenanceState: "OVERDUE",
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
  expect(
    screen.queryByRole("button", { name: /RET-001/ }),
  ).not.toBeInTheDocument();
});

it("ซ่อนทุกปุ่มเปลี่ยนข้อมูลเมื่อผู้ใช้มีสิทธิ์อ่านอย่างเดียว", () => {
  render(
    <EquipmentManager
      canManage={false}
      today="2026-08-21"
      history={[]}
      equipment={[
        {
          id: 1,
          code: "EQ-001",
          name: "ลู่วิ่ง",
          category: "CARDIO",
          location: "ชั้น 1",
          serialNumber: null,
          status: "OPERATIONAL",
          purchaseDate: null,
          warrantyEndDate: null,
          currentUsageHours: 0,
          maintenanceIntervalHours: null,
          nextMaintenanceHours: null,
          nextMaintenanceDate: null,
          lastMaintenanceDate: null,
          note: null,
          maintenanceState: "DUE_SOON",
          remainingHours: null,
          remainingDays: null,
          createdAt: null,
          updatedAt: null,
        },
      ]}
    />,
  );

  expect(screen.queryByRole("button", { name: "เพิ่มอุปกรณ์" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "อัปเดตมิเตอร์" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "บันทึกงานบำรุง" })).not.toBeInTheDocument();
  expect(screen.getByText("EQ-001 · ลู่วิ่ง")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /EQ-001/ })).not.toBeInTheDocument();
});

it("คงปุ่มเปลี่ยนข้อมูลไว้เมื่อผู้ใช้มีสิทธิ์จัดการ", () => {
  render(
    <EquipmentManager
      canManage
      today="2026-08-21"
      history={[]}
      equipment={[
        {
          id: 1,
          code: "EQ-001",
          name: "ลู่วิ่ง",
          category: "CARDIO",
          location: "ชั้น 1",
          serialNumber: null,
          status: "OPERATIONAL",
          purchaseDate: null,
          warrantyEndDate: null,
          currentUsageHours: 0,
          maintenanceIntervalHours: null,
          nextMaintenanceHours: null,
          nextMaintenanceDate: null,
          lastMaintenanceDate: null,
          note: null,
          maintenanceState: "DUE_SOON",
          remainingHours: null,
          remainingDays: null,
          createdAt: null,
          updatedAt: null,
        },
      ]}
    />,
  );

  expect(screen.getByRole("button", { name: "เพิ่มอุปกรณ์" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "อัปเดตมิเตอร์" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "บันทึกงานบำรุง" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /EQ-001/ })).toBeInTheDocument();
});
