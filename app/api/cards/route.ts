import { db } from "@/db";
import { cardPool, NewCardPool } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const createCardSchema = z.object({
  serial: z.string().min(1),
});

// GET /api/cards — ดึงบัตรทั้งหมด
export async function GET() {
  try {
    const branchId = await getCurrentBranchId();
    const result = await db.select().from(cardPool).where(eq(cardPool.branchId, branchId));
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// POST /api/cards — เพิ่มบัตรใหม่เข้า pool
export async function POST(request: Request) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("members.manage", branchId, {
      action: "CARD_CREATED",
      entityType: "CARD",
    });
    const body = await request.json();
    const validated = createCardSchema.parse(body);

    const newCard: NewCardPool = {
      branchId,
      serial: validated.serial,
      status: "AVAILABLE",
    };

    const id = await runAuditedMutation<number>(
      { actorStaffId: actor.staffId, branchId, action: "CARD_CREATED", entityType: "CARD", success: (entityId) => ({ entityId }) },
      async (tx) => {
        const result = await tx.insert(cardPool).values(newCard);
        return result[0].insertId;
      },
    );
    return NextResponse.json(
      { message: "Card created", id },
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
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
