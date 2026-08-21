import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getEquipmentDetail,
  updateEquipmentMaster,
  updateEquipmentOperation,
} from "@/lib/equipment-service";
import {
  updateEquipmentMasterSchema,
  updateEquipmentOperationSchema,
} from "@/lib/equipment-core";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { requirePermission } from "@/lib/staff-service";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { equipmentErrorResponse } from "@/lib/equipment-http";

const idSchema = z.coerce.number().int().positive().max(2_147_483_647);
const historyPageSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(2_147_483_647)
  .default(1);

/** อ่าน detail ด้วย permission และ branch scope เดียวกับประวัติ โดยไม่ใช้ Origin guard กับ GET */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const branchId = await getCurrentBranchId();
    await requirePermission("equipment.read", branchId, {
      action: "EQUIPMENT_READ",
      entityType: "EQUIPMENT",
    });
    const equipmentId = idSchema.parse((await params).id);
    const historyPage = historyPageSchema.parse(
      new URL(request.url).searchParams.get("historyPage") ?? undefined,
    );
    const today = new Date().toISOString().slice(0, 10);
    return NextResponse.json(
      await getEquipmentDetail(today, branchId, equipmentId, historyPage),
    );
  } catch (error) {
    return equipmentErrorResponse(error);
  }
}

/** แก้เฉพาะข้อมูลทะเบียนและบันทึกชื่อ field ที่เปลี่ยนโดยไม่เก็บค่าธุรกิจลง Audit */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertTrustedOrigin(request);
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("equipment.manage", branchId, {
      action: "EQUIPMENT_MASTER_UPDATED",
      entityType: "EQUIPMENT",
    });
    const equipmentId = idSchema.parse((await params).id);
    const validated = updateEquipmentMasterSchema.parse(await request.json());
    const fields = Object.keys(validated).filter(
      (field) => field !== "expectedVersion",
    );
    const result = await runAuditedMutation(
      {
        actorStaffId: actor.staffId,
        branchId,
        action: "EQUIPMENT_MASTER_UPDATED",
        entityType: "EQUIPMENT",
        entityId: equipmentId,
        metadata: { fields },
      },
      (tx) => updateEquipmentMaster(equipmentId, branchId, validated, tx),
    );
    return NextResponse.json({
      message: "แก้ไขข้อมูลอุปกรณ์แล้ว",
      id: equipmentId,
      version: result.version,
    });
  } catch (error) {
    return equipmentErrorResponse(error);
  }
}

/** อัปเดตมิเตอร์และสถานะผ่าน versioned service พร้อม Audit ใน transaction เดียวกัน */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertTrustedOrigin(request);
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("equipment.manage", branchId, {
      action: "EQUIPMENT_OPERATION_UPDATED",
      entityType: "EQUIPMENT",
    });
    const equipmentId = idSchema.parse((await params).id);
    const validated = updateEquipmentOperationSchema.parse(await request.json());
    const result = await runAuditedMutation(
      {
        actorStaffId: actor.staffId,
        branchId,
        action: "EQUIPMENT_OPERATION_UPDATED",
        entityType: "EQUIPMENT",
        entityId: equipmentId,
        metadata: {
          status: validated.status,
          fields: ["currentUsageHours", "status"],
        },
      },
      (tx) => updateEquipmentOperation(equipmentId, branchId, validated, tx),
    );
    return NextResponse.json({
      message: "อัปเดตสถานะอุปกรณ์แล้ว",
      id: equipmentId,
      version: result.version,
    });
  } catch (error) {
    return equipmentErrorResponse(error);
  }
}
