import { describe, expect, it } from "vitest";
import {
  createEquipmentSchema,
  dashboardFiltersSchema,
  getMaintenanceState,
  maintenanceSchema,
  parseStrictCalendarDate,
  retireEquipmentSchema,
  updateEquipmentMasterSchema,
  updateEquipmentOperationSchema,
} from "@/lib/equipment-core";
import {
  updateEquipmentOperation,
} from "@/lib/equipment-service";
import type { DbTransaction } from "@/lib/audit-service";

describe("equipment core", () => {
  it("master interval แยก omission และ explicit null โดยยังห้ามศูนย์/ติดลบ", () => {
    expect(updateEquipmentMasterSchema.parse({ expectedVersion: 3 })).not.toHaveProperty("maintenanceIntervalHours");
    expect(updateEquipmentMasterSchema.parse({ expectedVersion: 3, maintenanceIntervalHours: null })).toMatchObject({ maintenanceIntervalHours: null });
    for (const value of [0, -1, ""]) {
      expect(updateEquipmentMasterSchema.safeParse({ expectedVersion: 3, maintenanceIntervalHours: value }).success).toBe(false);
    }
    expect(createEquipmentSchema.safeParse({ code: "BIKE-1", name: "Bike", category: "CARDIO", location: "A", currentUsageHours: 0, maintenanceIntervalHours: null }).success).toBe(false);
  });
  it("จัดระดับ OVERDUE เมื่อชั่วโมงเกินกำหนดแม้เพียงหนึ่งชั่วโมง", () => {
    expect(
      getMaintenanceState(
        {
          currentUsageHours: 100,
          nextMaintenanceHours: 99,
          nextMaintenanceDate: null,
        },
        "2026-08-21",
      ).maintenanceState,
    ).toBe("OVERDUE");
  });

  it("จัดระดับ DUE_SOON เมื่อเหลือชั่วโมงเท่ากับขอบเขต", () => {
    expect(
      getMaintenanceState(
        {
          currentUsageHours: 100,
          nextMaintenanceHours: 150,
          nextMaintenanceDate: null,
        },
        "2026-08-21",
      ).maintenanceState,
    ).toBe("DUE_SOON");
  });

  it("คงระดับ SCHEDULED สำหรับกำหนดการในอนาคต และ NONE เมื่อไม่มีกำหนด", () => {
    expect(
      getMaintenanceState(
        {
          currentUsageHours: 100,
          nextMaintenanceHours: 151,
          nextMaintenanceDate: null,
        },
        "2026-08-21",
      ).maintenanceState,
    ).toBe("SCHEDULED");
    expect(
      getMaintenanceState(
        {
          currentUsageHours: 100,
          nextMaintenanceHours: null,
          nextMaintenanceDate: null,
        },
        "2026-08-21",
      ).maintenanceState,
    ).toBe("NONE");
  });

  it("ปฏิเสธวันที่ปฏิทินที่เป็นไปไม่ได้ แม้รูปแบบ YYYY-MM-DD ถูกต้อง", () => {
    expect(() => parseStrictCalendarDate("2026-02-30")).toThrow(
      "INVALID_CALENDAR_DATE",
    );
  });

  it("ยอมรับวันที่ว่างในฟอร์มสร้างเพื่อให้ service แปลงเป็น null", () => {
    expect(
      createEquipmentSchema.parse({
        code: "bike-01",
        name: "Bike 01",
        category: "CARDIO",
        location: "Floor 1",
        purchaseDate: "",
        warrantyEndDate: "",
        currentUsageHours: 0,
      }),
    ).toMatchObject({ code: "BIKE-01", purchaseDate: "", warrantyEndDate: "" });
  });

  it("ปฏิเสธวันสิ้นสุดประกันที่มาก่อนวันที่ซื้อ", () => {
    expect(
      createEquipmentSchema.safeParse({
        code: "BIKE-01",
        name: "Bike 01",
        category: "CARDIO",
        location: "Floor 1",
        purchaseDate: "2026-02-15",
        warrantyEndDate: "2026-02-14",
        currentUsageHours: 0,
      }).success,
    ).toBe(false);
  });

  it("ปฏิเสธงานที่เสร็จแล้วโดยไม่มีวันที่เสร็จ", () => {
    expect(
      maintenanceSchema.safeParse({
        type: "REPAIR",
        status: "COMPLETED",
        scheduledDate: "2026-08-21",
        cost: 0,
      }).success,
    ).toBe(false);
  });

  it("บังคับ expectedVersion สำหรับงานบำรุงโดยไม่มีค่า fallback", () => {
    expect(
      maintenanceSchema.safeParse({
        type: "REPAIR",
        status: "SCHEDULED",
        scheduledDate: "2026-08-21",
        cost: 0,
      }).success,
    ).toBe(false);
    expect(
      maintenanceSchema.parse({
        type: "REPAIR",
        status: "SCHEDULED",
        scheduledDate: "2026-08-21",
        cost: 0,
        expectedVersion: 4,
      }),
    ).toMatchObject({ expectedVersion: 4 });
  });

  it("บังคับตัวกรองหน้าที่ถูกต้องและตรึงขนาดหน้าไว้ที่ 20", () => {
    expect(dashboardFiltersSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(
      dashboardFiltersSchema.safeParse({ search: "x".repeat(101) }).success,
    ).toBe(false);
    expect(dashboardFiltersSchema.parse({ pageSize: 999 }).pageSize).toBe(20);
  });

  it("รับคำขอเลิกใช้งานที่ครบถ้วนและปฏิเสธ branchId ใน master update", () => {
    expect(
      retireEquipmentSchema.parse({ reason: "ชำรุดถาวร", expectedVersion: 3 }),
    ).toEqual({ reason: "ชำรุดถาวร", expectedVersion: 3 });
    expect(
      updateEquipmentMasterSchema.safeParse({
        branchId: 2,
        expectedVersion: 1,
      }).success,
    ).toBe(false);
  });

  it("ไม่ยอมรับ RETIRED เป็นสถานะการปฏิบัติการ", () => {
    expect(
      updateEquipmentOperationSchema.safeParse({
        currentUsageHours: 100,
        status: "RETIRED",
        expectedVersion: 3,
      }).success,
    ).toBe(false);
  });

  it("บังคับ expectedVersion สำหรับการอัปเดตปฏิบัติการ", () => {
    expect(
      updateEquipmentOperationSchema.safeParse({
        currentUsageHours: 100,
        status: "OPERATIONAL",
      }).success,
    ).toBe(false);
    expect(
      updateEquipmentOperationSchema.parse({
        currentUsageHours: 100,
        status: "OPERATIONAL",
        expectedVersion: 3,
      }),
    ).toEqual({
      currentUsageHours: 100,
      status: "OPERATIONAL",
      expectedVersion: 3,
    });
  });

  it("ปฏิเสธการอัปเดตปฏิบัติการกับแถวที่เลิกใช้งานแล้วก่อนเขียนข้อมูล", async () => {
    const retiredExecutor = {
      select: () => ({
        from: () => ({
          where: () => ({
            for: () => ({
              limit: async () => [
                {
                  id: 7,
                  currentUsageHours: 100,
                  status: "RETIRED",
                  version: 3,
                },
              ],
            }),
          }),
        }),
      }),
      update: () => {
        throw new Error("ต้องไม่เขียนอุปกรณ์ที่เลิกใช้งานแล้ว");
      },
    } as unknown as DbTransaction;

    await expect(
      updateEquipmentOperation(
        7,
        10,
        {
          currentUsageHours: 100,
          status: "OPERATIONAL",
          expectedVersion: 3,
        },
        retiredExecutor,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
});
