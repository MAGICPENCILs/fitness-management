import { cardPool } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const assignSchema = z.object({
  serial:   z.string(),
  memberId: z.number().int().positive(),
});

// POST /api/cards/assign — ผูกบัตรกับสมาชิก
export async function POST(request: Request) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("members.manage", branchId, {
      action: "CARD_ASSIGNED",
      entityType: "CARD",
    });
    const body = await request.json();
    const validated = assignSchema.parse(body);

    await runAuditedMutation(
      { actorStaffId: actor.staffId, branchId, action: "CARD_ASSIGNED", entityType: "CARD", metadata: { memberId: validated.memberId, status: "IN_USE" } },
      async (tx) => {
        const card = await tx.select({ id: cardPool.id, status: cardPool.status }).from(cardPool).where(and(eq(cardPool.serial, validated.serial), eq(cardPool.branchId, branchId))).limit(1).for("update");
        if (!card[0]) throw new Error("CARD_NOT_FOUND");
        if (card[0].status !== "AVAILABLE") throw new Error("CARD_NOT_AVAILABLE");
        await tx.update(cardPool).set({ status: "IN_USE", memberId: validated.memberId, assignedAt: new Date() }).where(eq(cardPool.id, card[0].id));
      },
    );

    return NextResponse.json({ message: "Card assigned" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message === "CARD_NOT_FOUND")
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    if (error instanceof Error && error.message === "CARD_NOT_AVAILABLE")
      return NextResponse.json({ error: "Card not available" }, { status: 400 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
