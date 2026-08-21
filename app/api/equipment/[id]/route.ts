import { NextResponse } from "next/server";
import { z } from "zod";
import {
  EquipmentOperationError,
  updateEquipmentOperation,
} from "@/lib/equipment-service";
import { updateEquipmentOperationSchema } from "@/lib/equipment-core";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

/** อัปเดตชั่วโมงและสถานะจากการตรวจหน้างาน โดยให้ service ป้องกันค่ามิเตอร์ย้อนหลัง */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("settings.manage", branchId, {
      action: "EQUIPMENT_UPDATED",
      entityType: "EQUIPMENT",
    });
    const { id } = await params;
    const equipmentId = z.coerce.number().int().positive().parse(id);
    const validated = updateEquipmentOperationSchema.parse(await request.json());
    await runAuditedMutation(
      {
        actorStaffId: actor.staffId,
        branchId,
        action: "EQUIPMENT_UPDATED",
        entityType: "EQUIPMENT",
        entityId: equipmentId,
        metadata: { fields: ["currentUsageHours", "status"] },
      },
      (tx) => updateEquipmentOperation(equipmentId, branchId, validated, tx),
    );
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
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json(
      { error: "ไม่สามารถอัปเดตอุปกรณ์ได้" },
      { status: 500 },
    );
  }
}
