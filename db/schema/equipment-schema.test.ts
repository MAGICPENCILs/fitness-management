import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { equipment } from "@/db/schema/equipment";

describe("equipment production schema", () => {
  it("เก็บ retirement และ version โดยไม่ถอด unique code", () => {
    const config = getTableConfig(equipment);

    expect(equipment.status.enumValues).toContain("RETIRED");
    expect(equipment.retiredAt).toBeDefined();
    expect(equipment.retiredReason).toBeDefined();
    expect(equipment.version.notNull).toBe(true);
    expect(equipment.version.hasDefault).toBe(true);
    expect(equipment.code.isUnique).toBe(true);
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "equipment_branch_status_idx",
        "equipment_branch_category_idx",
        "equipment_branch_next_maintenance_date_idx",
      ]),
    );
  });

  it("สร้าง migration แบบเพิ่มข้อมูล retirement โดยไม่ทำลายข้อมูลเดิม", () => {
    const sqlText = readFileSync(
      join(process.cwd(), "drizzle", "0011_equipment_production_ready.sql"),
      "utf8",
    );

    expect(sqlText).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/i);
    expect(sqlText).toContain("RETIRED");
    expect(sqlText).toContain("retired_at");
    expect(sqlText).toContain("retired_reason");
    expect(sqlText).toContain("version");
  });
});
