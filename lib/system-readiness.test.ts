import { describe, expect, it } from "vitest";

import {
  assertSchemaReady,
  getSystemReadiness,
  REQUIRED_MIGRATION,
  SchemaNotReadyError,
} from "@/lib/system-readiness";

describe("system readiness", () => {
  it.each([
    REQUIRED_MIGRATION.createdAt,
    REQUIRED_MIGRATION.createdAt + 1,
  ])("รายงาน READY เมื่อ migration ล่าสุดถึงรุ่นที่ต้องการ (%s)", async (createdAt) => {
    await expect(getSystemReadiness(async () => createdAt)).resolves.toEqual({
      status: "READY",
      requiredMigration: REQUIRED_MIGRATION.tag,
    });
  });

  it.each([null, REQUIRED_MIGRATION.createdAt - 1])(
    "รายงาน OUTDATED เมื่อ journal ยังไม่ถึงรุ่นที่ต้องการ (%s)",
    async (createdAt) => {
      await expect(getSystemReadiness(async () => createdAt)).resolves.toEqual({
        status: "OUTDATED",
        requiredMigration: REQUIRED_MIGRATION.tag,
      });
    },
  );

  it("ถือว่า journal ที่ยังไม่มีเป็น schema ล้าสมัย", async () => {
    await expect(
      getSystemReadiness(async () => {
        throw Object.assign(new Error("internal database detail"), {
          code: "ER_NO_SUCH_TABLE",
        });
      }),
    ).resolves.toEqual({
      status: "OUTDATED",
      requiredMigration: REQUIRED_MIGRATION.tag,
    });
  });

  it("ตรวจ error code ที่ Drizzle ห่อไว้ใน cause", async () => {
    const missingTable = Object.assign(new Error("internal mysql detail"), {
      code: "ER_NO_SUCH_TABLE",
    });

    await expect(
      getSystemReadiness(async () => {
        throw Object.assign(new Error("Failed query"), {
          cause: missingTable,
        });
      }),
    ).resolves.toEqual({
      status: "OUTDATED",
      requiredMigration: REQUIRED_MIGRATION.tag,
    });
  });

  it("รายงาน UNAVAILABLE โดยไม่ส่งรายละเอียดภายใน เมื่อ query ล้มเหลว", async () => {
    const readiness = await getSystemReadiness(async () => {
      throw new Error("mysql://secret@database/internal");
    });

    expect(readiness).toEqual({
      status: "UNAVAILABLE",
      requiredMigration: REQUIRED_MIGRATION.tag,
    });
    expect(JSON.stringify(readiness)).not.toContain("secret");
  });

  it("หยุด caller ก่อนทำงานต่อเมื่อ schema ไม่พร้อม", async () => {
    await expect(
      assertSchemaReady(async () => REQUIRED_MIGRATION.createdAt - 1),
    ).rejects.toBeInstanceOf(SchemaNotReadyError);
  });
});
