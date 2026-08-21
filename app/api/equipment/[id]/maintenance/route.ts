import { NextResponse } from "next/server";
import { z } from "zod";
import {
  EquipmentOperationError,
  recordMaintenance,
} from "@/lib/equipment-service";
import { maintenanceSchema } from "@/lib/equipment-core";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

/** บันทึกงานซ่อมหรือตรวจเช็ก และให้ service เปลี่ยนสถานะกับรอบถัดไปใน transaction เดียว */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("settings.manage", branchId, {
      action: "MAINTENANCE_RECORDED",
      entityType: "MAINTENANCE",
    });
    const { id } = await params;
    const equipmentId = z.coerce.number().int().positive().parse(id);
    const validated = maintenanceSchema.parse(await request.json());
    const result = await runAuditedMutation<{
      maintenanceId: number;
      equipmentVersion: number;
    }>(
      {
        actorStaffId: actor.staffId,
        branchId,
        action: "MAINTENANCE_RECORDED",
        entityType: "MAINTENANCE",
        metadata: { entityId: equipmentId, status: validated.status },
        success: (value) => ({ entityId: value.maintenanceId }),
      },
      (tx) => recordMaintenance(equipmentId, branchId, {
        ...validated,
        usageHoursAtService: validated.usageHoursAtService ?? undefined,
      }, tx),
    );
    return NextResponse.json(
      { message: "บันทึกงานบำรุงรักษาแล้ว", maintenanceId: result.maintenanceId },
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
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json(
      { error: "ไม่สามารถบันทึกงานบำรุงรักษาได้" },
      { status: 500 },
    );
  }
}
