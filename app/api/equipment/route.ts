import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createEquipment,
  EquipmentOperationError,
} from "@/lib/equipment-service";
import { getCurrentBranchId } from "@/lib/branch-service";

const optionalDate = z
  .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
  .optional();

const createEquipmentSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(1)
      .max(30)
      .regex(/^[A-Z0-9-]+$/),
    name: z.string().trim().min(2).max(120),
    category: z.enum([
      "CARDIO",
      "STRENGTH",
      "FREE_WEIGHT",
      "ACCESSORY",
      "OTHER",
    ]),
    location: z.string().trim().min(1).max(100),
    serialNumber: z.string().trim().max(100).optional(),
    purchaseDate: optionalDate,
    warrantyEndDate: optionalDate,
    currentUsageHours: z.coerce.number().int().min(0).max(10_000_000),
    maintenanceIntervalHours: z.coerce
      .number()
      .int()
      .positive()
      .max(1_000_000)
      .optional(),
    nextMaintenanceDate: optionalDate,
    note: z.string().trim().max(1000).optional(),
  })
  .refine(
    (value) =>
      !value.purchaseDate ||
      !value.warrantyEndDate ||
      value.warrantyEndDate >= value.purchaseDate,
    {
      message: "วันสิ้นสุดประกันต้องไม่ก่อนวันที่ซื้อ",
      path: ["warrantyEndDate"],
    },
  );

/** ตรวจข้อมูลทะเบียนอุปกรณ์และส่งให้ service คำนวณรอบบำรุงครั้งแรก */
export async function POST(request: Request) {
  try {
    const validated = createEquipmentSchema.parse(await request.json());
    const id = await createEquipment({
      ...validated,
      branchId: await getCurrentBranchId(),
      maintenanceIntervalHours: validated.maintenanceIntervalHours || undefined,
    });
    return NextResponse.json(
      { message: "เพิ่มอุปกรณ์แล้ว", id },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "ข้อมูลอุปกรณ์ไม่ถูกต้อง" },
        { status: 400 },
      );
    if (error instanceof EquipmentOperationError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error(error);
    return NextResponse.json(
      { error: "ไม่สามารถเพิ่มอุปกรณ์ได้" },
      { status: 500 },
    );
  }
}
