import { db } from "@/db";
import { packages, NewPackage } from "@/db/schema";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const createPackageSchema = z.object({
  name:         z.string().min(1),
  description:  z.string().optional(),
  type:         z.enum(["DAILY", "MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "CUSTOM"]),
  durationDays: z.number().int().positive(),
  price:        z.number().positive(),
});

// GET /api/packages
export async function GET() {
  try {
    const branchId = await getCurrentBranchId();
    await requirePermission("payments.manage", branchId);
    const result = await db.select().from(packages);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Failed to fetch packages" }, { status: 500 });
  }
}

// POST /api/packages
export async function POST(request: Request) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("payments.manage", branchId, { action: "PACKAGE_CREATED", entityType: "PACKAGE" });
    const body = await request.json();
    const validated = createPackageSchema.parse(body);

    const newPackage: NewPackage = {
      ...validated,
      price: String(validated.price),
      isActive: true,
    };

    const id = await runAuditedMutation<number>(
      { actorStaffId: actor.staffId, branchId, action: "PACKAGE_CREATED", entityType: "PACKAGE", success: (entityId) => ({ entityId }) },
      async (tx) => {
        const result = await tx.insert(packages).values(newPackage);
        return result[0].insertId;
      },
    );
    return NextResponse.json(
      { message: "Package created", id },
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
    return NextResponse.json({ error: "Failed to create package" }, { status: 500 });
  }
}
