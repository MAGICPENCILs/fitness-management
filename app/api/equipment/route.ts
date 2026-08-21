import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createEquipment,
  EquipmentOperationError,
} from "@/lib/equipment-service";
import { createEquipmentSchema } from "@/lib/equipment-core";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

/** ตรวจข้อมูลทะเบียนอุปกรณ์และส่งให้ service คำนวณรอบบำรุงครั้งแรก */
export async function POST(request: Request) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("settings.manage", branchId, {
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
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json(
      { error: "ไม่สามารถเพิ่มอุปกรณ์ได้" },
      { status: 500 },
    );
  }
}
