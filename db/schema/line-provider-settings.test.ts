import { getTableConfig, MySqlDialect } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import { lineProviderSettings } from "@/db/schema";

describe("LINE provider settings schema", () => {
  it("จำกัดให้มีแถว id=1 เพื่อไม่ให้ webhook อ่าน config ได้หลายค่า", () => {
    expect(lineProviderSettings.id.primary).toBe(true);
    expect(getTableConfig(lineProviderSettings).checks.map(({ value }) => new MySqlDialect().sqlToQuery(value).sql))
      .toContain("`id` = 1");
  });

  it("บังคับให้ระบุ destination แม้ล้าง credentials ทั้งสองค่า", () => {
    expect(lineProviderSettings.destination.notNull).toBe(true);
    expect(lineProviderSettings.accessTokenEncrypted.notNull).toBe(false);
    expect(lineProviderSettings.channelSecretEncrypted.notNull).toBe(false);
  });
});
