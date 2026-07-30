import { cardPool } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const unassignSchema = z.object({
  serial: z.string(),
});

// POST /api/cards/unassign — คืนบัตรเข้า pool
export async function POST(request: Request) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("members.manage", branchId, {
      action: "CARD_UNASSIGNED",
      entityType: "CARD",
    });
    const body = await request.json();
    const validated = unassignSchema.parse(body);

    await runAuditedMutation(
      { actorStaffId: actor.staffId, branchId, action: "CARD_UNASSIGNED", entityType: "CARD", metadata: { status: "AVAILABLE" } },
      async (tx) => {
        const result = await tx.update(cardPool).set({ status: "AVAILABLE", memberId: null, assignedAt: null }).where(and(eq(cardPool.serial, validated.serial), eq(cardPool.branchId, branchId)));
        if (result[0].affectedRows !== 1) throw new Error("CARD_NOT_FOUND");
      },
    );

    return NextResponse.json({ message: "Card unassigned" });
  } catch (error) {
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message === "CARD_NOT_FOUND")
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
