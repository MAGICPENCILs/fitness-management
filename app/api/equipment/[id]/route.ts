import { NextResponse } from "next/server";
import { z } from "zod";
import {
  EquipmentOperationError,
  updateEquipmentOperation,
} from "@/lib/equipment-service";

const updateEquipmentSchema = z.object({
  currentUsageHours: z.coerce.number().int().min(0).max(10_000_000),
  status: z.enum(["OPERATIONAL", "MAINTENANCE", "OUT_OF_SERVICE"]),
});

/** อัปเดตชั่วโมงและสถานะจากการตรวจหน้างาน โดยให้ service ป้องกันค่ามิเตอร์ย้อนหลัง */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const equipmentId = z.coerce.number().int().positive().parse(id);
    const validated = updateEquipmentSchema.parse(await request.json());
    await updateEquipmentOperation(equipmentId, validated);
    return NextResponse.json({ message: "อัปเดตสถานะอุปกรณ์แล้ว" });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "ข้อมูลอัปเดตไม่ถูกต้อง" },
        { status: 400 },
      );
    if (error instanceof EquipmentOperationError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error(error);
    return NextResponse.json(
      { error: "ไม่สามารถอัปเดตอุปกรณ์ได้" },
      { status: 500 },
    );
  }
}
