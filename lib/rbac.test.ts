import { describe, expect, it } from "vitest";
import {
  getPermissionSnapshot,
  hasPermission,
  type StaffRole,
} from "@/lib/rbac";

const actor = (role: StaffRole, branchId = 2) => ({
  staffId: 10,
  role,
  homeBranchId: branchId,
});

describe("RBAC", () => {
  it("ให้ Owner จัดการความเป็นส่วนตัวข้ามสาขา", () => {
    expect(
      hasPermission(actor("OWNER"), "privacy.request.approve", 99),
    ).toBe(true);
  });

  it("จำกัด Manager ให้อนุมัติคำขอในสาขาตน", () => {
    expect(
      hasPermission(actor("MANAGER"), "privacy.request.approve", 2),
    ).toBe(true);
    expect(
      hasPermission(actor("MANAGER"), "privacy.request.approve", 3),
    ).toBe(false);
  });

  it("ไม่ให้ Counter อนุมัติคำขอ", () => {
    expect(
      hasPermission(actor("COUNTER"), "privacy.request.approve", 2),
    ).toBe(false);
  });

  it("ให้ Trainer จัดการคลาสและ PT เฉพาะสาขาตน", () => {
    expect(hasPermission(actor("TRAINER"), "classes.manage", 2)).toBe(true);
    expect(hasPermission(actor("TRAINER"), "pt.manage", 3)).toBe(false);
  });

  it("สร้าง snapshot สำหรับกรอง UI จาก matrix เดียวกัน", () => {
    expect(getPermissionSnapshot(actor("COUNTER"))).toMatchObject({
      "members.manage": true,
      "payments.manage": true,
      "accounting.manage": false,
    });
  });
});
