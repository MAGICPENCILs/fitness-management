import { getTableConfig, MySqlDialect } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import { accessSettings } from "@/db/schema";

describe("access settings schema", () => {
  it("จำกัด singleton และ grace period ให้อยู่ระหว่าง 3–7 วัน", () => {
    const checks = getTableConfig(accessSettings).checks.map(({ value }) => new MySqlDialect().sqlToQuery(value).sql);
    expect(accessSettings.id.primary).toBe(true);
    expect(accessSettings.graceDays.notNull).toBe(true);
    expect(accessSettings.graceDays.default).toBe(3);
    expect(checks).toContain("`id` = 1");
    expect(checks).toContain("`grace_days` between 3 and 7");
  });
});
