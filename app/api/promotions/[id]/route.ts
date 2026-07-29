import { db } from "@/db";
import { promotions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

// PATCH /api/promotions/[id] — toggle isActive
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    await db
      .update(promotions)
      .set({ isActive: body.isActive })
      .where(eq(promotions.id, Number(id)));

    return NextResponse.json({ message: "Updated" });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}