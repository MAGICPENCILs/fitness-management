import { NextResponse } from "next/server";
import { z } from "zod";
import { awardLoyaltyPoints, CrmOperationError } from "@/lib/crm-service";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const pointsSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  points: z.coerce.number().int().min(1).max(1_000_000),
  source: z.string().trim().min(2, "กรุณาระบุที่มาของคะแนน").max(120),
  note: z.string().trim().max(500).optional(),
});

/** ตรวจข้อมูลและเพิ่มคะแนนสะสมแบบ ledger ให้สมาชิก */
export async function POST(request: Request) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("members.manage", branchId, { action: "LOYALTY_POINTS_AWARDED", entityType: "LOYALTY_POINT" });
    const validated = pointsSchema.parse(await request.json());
    const id = await runAuditedMutation<number>(
      { actorStaffId: actor.staffId, branchId, action: "LOYALTY_POINTS_AWARDED", entityType: "LOYALTY_POINT", metadata: { memberId: validated.memberId, count: validated.points }, success: (entityId) => ({ entityId }) },
      (tx) => awardLoyaltyPoints({ ...validated, branchId }, tx),
    );
    return NextResponse.json({ message: "เพิ่มคะแนนสะสมแล้ว", id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "ข้อมูลคะแนนไม่ถูกต้อง" },
        { status: 400 },
      );
    if (error instanceof CrmOperationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถเพิ่มคะแนนได้" }, { status: 500 });
  }
}
