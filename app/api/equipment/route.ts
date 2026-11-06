import { NextResponse } from "next/server";
import {
  createEquipment,
} from "@/lib/equipment-service";
import { createEquipmentSchema } from "@/lib/equipment-core";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { requirePermission } from "@/lib/staff-service";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { equipmentErrorResponse } from "@/lib/equipment-http";

/** ตรวจ Origin และสิทธิ์ตามสาขาก่อนสร้างอุปกรณ์กับ Audit ใน transaction เดียวกัน */
export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("equipment.manage", branchId, {
      action: "EQUIPMENT_CREATED",
      entityType: "EQUIPMENT",
    });
    const validated = createEquipmentSchema.parse(await request.json());
    const id = await runAuditedMutation<number>(
      {
        actorStaffId: actor.staffId,
        branchId,
        action: "EQUIPMENT_CREATED",
        entityType: "EQUIPMENT",
        success: (entityId) => ({ entityId }),
      },
      (tx) => createEquipment({
        ...validated,
        branchId,
        maintenanceIntervalHours: validated.maintenanceIntervalHours || undefined,
      }, tx),
    );
    return NextResponse.json(
      { message: "เพิ่มอุปกรณ์แล้ว", id, version: 1 },
      { status: 201 },
    );
  } catch (error) {
    return equipmentErrorResponse(error);
  }
}
