import { memberPackages, members, NewMemberPackage } from "@/db/schema";
import { packages } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const createMemberPackageSchema = z.object({
  memberId:  z.number().int().positive(),
  packageId: z.number().int().positive(),
  startDate: z.string(),
  paidAmount: z.number(),
});

export async function POST(request: Request) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("payments.manage", branchId, { action: "MEMBER_PACKAGE_CREATED", entityType: "MEMBER_PACKAGE" });
    const body = await request.json();
    const validated = createMemberPackageSchema.parse(body);

    // ดึง package มาคำนวณ expire_date
    const id = await runAuditedMutation<number>(
      { actorStaffId: actor.staffId, branchId, action: "MEMBER_PACKAGE_CREATED", entityType: "MEMBER_PACKAGE", metadata: { memberId: validated.memberId }, success: (entityId) => ({ entityId }) },
      async (tx) => {
        const [[pkg], [member]] = await Promise.all([
          tx.select().from(packages).where(eq(packages.id, validated.packageId)).limit(1),
          tx.select({ id: members.id }).from(members).where(and(eq(members.id, validated.memberId), eq(members.homeBranchId, branchId))).limit(1),
        ]);
        if (!pkg) throw new Error("PACKAGE_NOT_FOUND");
        if (!member) throw new Error("MEMBER_NOT_FOUND_IN_BRANCH");
        const startDate = new Date(validated.startDate);
        const expireDate = new Date(startDate);
        expireDate.setDate(expireDate.getDate() + pkg.durationDays);
        const newMemberPackage: NewMemberPackage = { memberId: validated.memberId, packageId: validated.packageId, startDate, expireDate, paidAmount: validated.paidAmount, status: "ACTIVE" };
        const result = await tx.insert(memberPackages).values(newMemberPackage);
        return result[0].insertId;
      },
    );

    return NextResponse.json(
      { message: "Member package created", id },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message === "PACKAGE_NOT_FOUND")
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    if (error instanceof Error && error.message === "MEMBER_NOT_FOUND_IN_BRANCH")
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
