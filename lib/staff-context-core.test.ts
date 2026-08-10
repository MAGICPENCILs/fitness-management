import { describe, expect, it } from "vitest";
import {
  resolveStaffSelection,
  StaffContextError,
  type StaffSelectionRow,
} from "@/lib/staff-context-core";

const rows: StaffSelectionRow[] = [
  {
    id: 1,
    staffCode: "OWNER001",
    role: "OWNER",
    homeBranchId: 1,
    status: "ACTIVE",
  },
  {
    id: 2,
    staffCode: "CTR001",
    role: "COUNTER",
    homeBranchId: 1,
    status: "INACTIVE",
  },
  {
    id: 3,
    staffCode: "MGR001",
    role: "MANAGER",
    homeBranchId: 2,
    status: "ACTIVE",
  },
];

describe("staff context selection", () => {
  it("bootstrap ด้วย active Owner เมื่อยังไม่มี cookie", () => {
    expect(resolveStaffSelection(rows, undefined).id).toBe(1);
  });

  it("เลือก active staff ตาม cookie", () => {
    expect(resolveStaffSelection(rows, "3").staffCode).toBe("MGR001");
  });

  it("ไม่ fallback เป็น Owner เมื่อ cookie อ้าง inactive staff", () => {
    expect(() => resolveStaffSelection(rows, "2")).toThrowError(
      expect.objectContaining<Partial<StaffContextError>>({ status: 401 }),
    );
  });

  it("ไม่ fallback เป็น Owner เมื่อ cookie ไม่ใช่ staff id", () => {
    expect(() => resolveStaffSelection(rows, "abc")).toThrowError(
      expect.objectContaining<Partial<StaffContextError>>({ status: 401 }),
    );
  });

  it("แจ้งระบบไม่พร้อมเมื่อไม่มี active Owner สำหรับ bootstrap", () => {
    expect(() => resolveStaffSelection(rows.slice(1), undefined)).toThrowError(
      expect.objectContaining<Partial<StaffContextError>>({ status: 503 }),
    );
  });
});
