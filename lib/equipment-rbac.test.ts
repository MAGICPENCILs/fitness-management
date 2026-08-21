import { describe, expect, it } from "vitest";
import { hasPermission } from "@/lib/rbac";

describe("equipment RBAC", () => {
  it.each([
    ["OWNER", true, true],
    ["MANAGER", true, true],
    ["COUNTER", true, false],
    ["TRAINER", true, false],
  ] as const)(
    "กำหนด equipment permissions ให้ %s",
    (role, canRead, canManage) => {
      const actor = { staffId: 1, role, homeBranchId: 10 };

      expect(hasPermission(actor, "equipment.read", 10)).toBe(canRead);
      expect(hasPermission(actor, "equipment.manage", 10)).toBe(canManage);
    },
  );

  it("จำกัดบทบาทที่ไม่ใช่ Owner ให้อ่านอุปกรณ์เฉพาะสาขาตน", () => {
    expect(
      hasPermission(
        { staffId: 1, role: "COUNTER", homeBranchId: 10 },
        "equipment.read",
        11,
      ),
    ).toBe(false);
  });
});
