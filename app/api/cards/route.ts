import { db } from "@/db";
import { cardPool, NewCardPool } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const createCardSchema = z.object({
  serial: z.string().min(1),
});

// GET /api/cards — ดึงบัตรทั้งหมด
export async function GET() {
  try {
    const result = await db.select().from(cardPool);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// POST /api/cards — เพิ่มบัตรใหม่เข้า pool
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = createCardSchema.parse(body);

    const newCard: NewCardPool = {
      serial: validated.serial,
      status: "AVAILABLE",
    };

    const result = await db.insert(cardPool).values(newCard);
    return NextResponse.json(
      { message: "Card created", id: result[0].insertId },
      { status: 201 }
    );
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