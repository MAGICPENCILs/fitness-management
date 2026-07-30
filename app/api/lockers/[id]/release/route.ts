import { NextResponse } from "next/server";
import { z } from "zod";
import { LockerOperationError, releaseLocker } from "@/lib/locker-service";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

/** คืนล็อกเกอร์และปิดประวัติที่กำลังใช้งานภายใน transaction เดียว */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("access.manage", branchId, {
      action: "LOCKER_RELEASED",
      entityType: "LOCKER",
    });
    const { id } = await params;
    const lockerId = z.coerce.number().int().positive().parse(id);
    await runAuditedMutation(
      {
        actorStaffId: actor.staffId,
        branchId,
        action: "LOCKER_RELEASED",
        entityType: "LOCKER",
        entityId: lockerId,
        metadata: { status: "AVAILABLE" },
      },
      (tx) => releaseLocker(lockerId, branchId, tx),
    );
    return NextResponse.json({ message: "คืนล็อกเกอร์แล้ว" });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "รหัสล็อกเกอร์ไม่ถูกต้อง" },
        { status: 400 },
      );
    if (error instanceof LockerOperationError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json(
      { error: "ไม่สามารถคืนล็อกเกอร์ได้" },
      { status: 500 },
    );
  }
}
