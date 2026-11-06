import { NextResponse } from "next/server";
import { z } from "zod";
import { retireEquipment } from "@/lib/equipment-service";
import { retireEquipmentSchema } from "@/lib/equipment-core";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { requirePermission } from "@/lib/staff-service";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { equipmentErrorResponse } from "@/lib/equipment-http";

const idSchema = z.coerce.number().int().positive().max(2_147_483_647);

/** เปลี่ยน lifecycle เป็น RETIRED แบบถาวร โดยไม่ส่งเหตุผลอิสระเข้า Audit metadata */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertTrustedOrigin(request);
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("equipment.manage", branchId, {
      action: "EQUIPMENT_RETIRED",
      entityType: "EQUIPMENT",
    });
    const equipmentId = idSchema.parse((await params).id);
    const validated = retireEquipmentSchema.parse(await request.json());
    const retiredAt = new Date();
    const result = await runAuditedMutation(
      {
        actorStaffId: actor.staffId,
        branchId,
        action: "EQUIPMENT_RETIRED",
        entityType: "EQUIPMENT",
        entityId: equipmentId,
        metadata: { status: "RETIRED" },
      },
      (tx) =>
        retireEquipment(equipmentId, branchId, validated, retiredAt, tx),
    );
    return NextResponse.json({
      message: "เลิกใช้งานอุปกรณ์แล้ว",
      id: equipmentId,
      version: result.version,
    });
  } catch (error) {
    return equipmentErrorResponse(error);
  }
}
