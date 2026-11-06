import { existsSync, readFileSync } from "node:fs";
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
        "equipment_branch_maintenance_idx",
      ]),
    );
  });

  it("ต่อ migration 0017 หลัง workforce โดยไม่เปลี่ยนลำดับเดิม", () => {
    const journal = JSON.parse(
      readFileSync(join(process.cwd(), "drizzle/meta/_journal.json"), "utf8"),
    );

    expect(journal.entries.slice(16, 18)).toEqual([
      expect.objectContaining({ idx: 16, tag: "0016_add_staff_workforce" }),
      expect.objectContaining({ idx: 17, tag: "0017_equipment_production_ready" }),
    ]);
  });

  it("สร้าง migration 0017 เฉพาะเจ็ดคำสั่งที่ไม่ทำลายข้อมูลเดิม", () => {
    const migrationPath = join(
      process.cwd(), "drizzle", "0017_equipment_production_ready.sql",
    );

    expect(existsSync(migrationPath)).toBe(true);
    const sqlText = readFileSync(migrationPath, "utf8");
    const statements = sqlText
      .replaceAll("--> statement-breakpoint", "")
      .split(";")
      .map((statement) => statement.trim().replace(/\s+/g, " "))
      .filter(Boolean);

    expect(sqlText).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/i);
    // เทียบคำสั่งทั้งหมดเพื่อป้องกันการเปลี่ยนตารางอื่นหรือแก้ข้อมูลโดยไม่ตั้งใจ.
    expect(statements.sort()).toEqual([
      "ALTER TABLE `equipment` MODIFY COLUMN `status` enum('OPERATIONAL','MAINTENANCE','OUT_OF_SERVICE','RETIRED') NOT NULL DEFAULT 'OPERATIONAL'",
      "ALTER TABLE `equipment` ADD `retired_at` timestamp",
      "ALTER TABLE `equipment` ADD `retired_reason` varchar(500)",
      "ALTER TABLE `equipment` ADD `version` int DEFAULT 1 NOT NULL",
      "CREATE INDEX `equipment_branch_status_idx` ON `equipment` (`branch_id`,`status`)",
      "CREATE INDEX `equipment_branch_category_idx` ON `equipment` (`branch_id`,`category`)",
      "CREATE INDEX `equipment_branch_maintenance_idx` ON `equipment` (`branch_id`,`next_maintenance_date`)",
    ].sort());
    const identifiers = [...sqlText.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    expect(identifiers.filter((name) => [...name].length > 64)).toEqual([]);
  });
});
