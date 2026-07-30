import { NextResponse } from "next/server";
import { z } from "zod";
import {
  cancelPtSession,
  PersonalTrainingOperationError,
} from "@/lib/personal-training-service";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

/** ยกเลิกนัด PT ที่ยังไม่ปิดงานและคืนโควตาให้แพ็กเกจ */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("pt.manage", branchId, {
      action: "PT_SESSION_CANCELLED",
      entityType: "PT_SESSION",
    });
    const { id } = await params;
    const sessionId = z.coerce.number().int().positive().parse(id);
    await runAuditedMutation(
      { actorStaffId: actor.staffId, branchId, action: "PT_SESSION_CANCELLED", entityType: "PT_SESSION", entityId: sessionId, metadata: { status: "CANCELLED" } },
      (tx) => cancelPtSession(sessionId, branchId, tx),
    );
    return NextResponse.json({ message: "ยกเลิกนัด PT แล้ว" });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: "รหัส Session ไม่ถูกต้อง" }, { status: 400 });
    if (error instanceof PersonalTrainingOperationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json(
      { error: "ไม่สามารถยกเลิกนัด PT ได้" },
      { status: 500 },
    );
  }
}
