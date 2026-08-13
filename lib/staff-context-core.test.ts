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
  it("ไม่ fallback เป็น Owner เมื่อไม่มี staff cookie", () => {
    expect(() => resolveStaffSelection(rows, undefined)).toThrowError(
      expect.objectContaining<Partial<StaffContextError>>({ status: 401 }),
    );
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
});
