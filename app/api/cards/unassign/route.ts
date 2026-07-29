import { db } from "@/db";
import { cardPool } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const unassignSchema = z.object({
  serial: z.string(),
});

// POST /api/cards/unassign — คืนบัตรเข้า pool
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = unassignSchema.parse(body);

    await db
      .update(cardPool)
      .set({
        status:     "AVAILABLE",
        memberId:   null,
        assignedAt: null,
      })
      .where(eq(cardPool.serial, validated.serial));

    return NextResponse.json({ message: "Card unassigned" });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}