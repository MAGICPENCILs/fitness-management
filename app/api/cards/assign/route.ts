import { db } from "@/db";
import { cardPool } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentBranchId } from "@/lib/branch-service";

const assignSchema = z.object({
  serial:   z.string(),
  memberId: z.number().int().positive(),
});

// POST /api/cards/assign — ผูกบัตรกับสมาชิก
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = assignSchema.parse(body);
    const branchId = await getCurrentBranchId();

    // เช็คว่าบัตรว่างอยู่ไหม
    const card = await db
      .select()
      .from(cardPool)
      .where(and(eq(cardPool.serial, validated.serial), eq(cardPool.branchId, branchId)))
      .limit(1);

    if (card.length === 0) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    if (card[0].status !== "AVAILABLE") {
      return NextResponse.json({ error: "Card not available" }, { status: 400 });
    }

    // ผูกบัตร
    await db
      .update(cardPool)
      .set({
        status:     "IN_USE",
        memberId:   validated.memberId,
        assignedAt: new Date(),
      })
      .where(and(eq(cardPool.serial, validated.serial), eq(cardPool.branchId, branchId)));

    return NextResponse.json({ message: "Card assigned" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
