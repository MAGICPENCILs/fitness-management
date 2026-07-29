import { NextResponse } from "next/server";
import { z } from "zod";
import {
  EquipmentOperationError,
  recordMaintenance,
} from "@/lib/equipment-service";

const optionalDate = z
  .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
  .optional();

const maintenanceSchema = z
  .object({
    type: z.enum(["INSPECTION", "PREVENTIVE", "REPAIR"]),
    status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED"]),
    scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    completedDate: optionalDate,
    usageHoursAtService: z.coerce
      .number()
      .int()
      .min(0)
      .max(10_000_000)
      .optional(),
    cost: z.coerce.number().min(0).max(99_999_999.99),
    technician: z.string().trim().max(120).optional(),
    nextMaintenanceDate: optionalDate,
    note: z.string().trim().max(1000).optional(),
  })
  .refine(
    (value) => value.status !== "COMPLETED" || Boolean(value.completedDate),
    {
      message: "งานที่เสร็จแล้วต้องระบุวันที่เสร็จ",
      path: ["completedDate"],
    },
  )
  .refine(
    (value) =>
      !value.completedDate || value.completedDate >= value.scheduledDate,
    {
      message: "วันที่เสร็จต้องไม่ก่อนวันที่นัดหมาย",
      path: ["completedDate"],
    },
  );

/** บันทึกงานซ่อมหรือตรวจเช็ก และให้ service เปลี่ยนสถานะกับรอบถัดไปใน transaction เดียว */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const equipmentId = z.coerce.number().int().positive().parse(id);
    const validated = maintenanceSchema.parse(await request.json());
    const maintenanceId = await recordMaintenance(equipmentId, {
      ...validated,
      usageHoursAtService: validated.usageHoursAtService ?? undefined,
    });
    return NextResponse.json(
      { message: "บันทึกงานบำรุงรักษาแล้ว", maintenanceId },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "ข้อมูลงานบำรุงไม่ถูกต้อง" },
        { status: 400 },
      );
    if (error instanceof EquipmentOperationError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error(error);
    return NextResponse.json(
      { error: "ไม่สามารถบันทึกงานบำรุงรักษาได้" },
      { status: 500 },
    );
  }
}
