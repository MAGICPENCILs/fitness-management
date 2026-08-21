import { NextResponse } from "next/server";
import { z } from "zod";
import { recordMaintenance } from "@/lib/equipment-service";
import { maintenanceSchema } from "@/lib/equipment-core";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { requirePermission } from "@/lib/staff-service";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { equipmentErrorResponse } from "@/lib/equipment-http";

const idSchema = z.coerce.number().int().positive().max(2_147_483_647);

/** บันทึกงานซ่อมพร้อม equipment version และใช้ maintenance id เป็น Audit entity ใน transaction เดียว */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertTrustedOrigin(request);
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("equipment.manage", branchId, {
      action: "MAINTENANCE_RECORDED",
      entityType: "MAINTENANCE",
    });
    const equipmentId = idSchema.parse((await params).id);
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
        metadata: {
          maintenanceType: validated.type,
          maintenanceStatus: validated.status,
        },
        success: (value) => ({ entityId: value.maintenanceId }),
      },
      (tx) => recordMaintenance(equipmentId, branchId, {
        ...validated,
        usageHoursAtService: validated.usageHoursAtService ?? undefined,
      }, tx),
    );
    return NextResponse.json(
      {
        message: "บันทึกงานบำรุงรักษาแล้ว",
        id: result.maintenanceId,
        version: result.equipmentVersion,
      },
      { status: 201 },
    );
  } catch (error) {
    return equipmentErrorResponse(error);
  }
}
