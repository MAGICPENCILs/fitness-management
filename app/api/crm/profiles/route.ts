import { NextResponse } from "next/server";
import { z } from "zod";
import { CrmOperationError, saveMemberCrmProfile } from "@/lib/crm-service";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const profileSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  interests: z.string().trim().max(500).optional(),
  fitnessGoals: z.string().trim().max(500).optional(),
  preferredContact: z.enum(["PHONE", "LINE", "SMS", "EMAIL", "NONE"]),
});

/** ตรวจข้อมูลและบันทึกโปรไฟล์ CRM ของสมาชิก */
export async function POST(request: Request) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("members.manage", branchId, { action: "CRM_PROFILE_SAVED", entityType: "CRM_PROFILE" });
    const validated = profileSchema.parse(await request.json());
    await runAuditedMutation(
      { actorStaffId: actor.staffId, branchId, action: "CRM_PROFILE_SAVED", entityType: "CRM_PROFILE", entityId: validated.memberId, metadata: { memberId: validated.memberId } },
      (tx) => saveMemberCrmProfile({ ...validated, branchId }, tx),
    );
    return NextResponse.json({ message: "บันทึกโปรไฟล์ CRM แล้ว" });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "ข้อมูลโปรไฟล์ไม่ถูกต้อง" },
        { status: 400 },
      );
    if (error instanceof CrmOperationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถบันทึกโปรไฟล์ CRM ได้" }, { status: 500 });
  }
}
