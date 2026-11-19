import { getTableConfig } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import { accessLogs } from "@/db/schema";

describe("access logs schema", () => {
  it("บังคับสิทธิ์ DAILY ให้ใช้ได้ครั้งเดียวต่อสมาชิกและวันไทย", () => {
    const config = getTableConfig(accessLogs);
    const dailyUseIndex = config.indexes.find(index => index.config.name === "access_logs_member_daily_use_unique");

    expect(accessLogs.dailyUseDate.notNull).toBe(false);
    expect(dailyUseIndex?.config.unique).toBe(true);
    expect(dailyUseIndex?.config.columns).toEqual([accessLogs.memberId, accessLogs.dailyUseDate]);
  });
});
