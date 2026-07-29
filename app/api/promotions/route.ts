import { db } from "@/db";
import { promotions, NewPromotion } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const promotionSchema = z.object({
  name:        z.string().min(1),
  description: z.string().optional(),
  type:        z.enum(["DISCOUNT_AMOUNT", "DISCOUNT_PERCENT", "BONUS_DAYS"]),
  value:       z.number().positive(),
  startDate:   z.string(),
  endDate:     z.string(),
}).superRefine((value, context) => {
  if (value.type === "DISCOUNT_PERCENT" && value.value > 100) {
    context.addIssue({ code: "custom", path: ["value"], message: "เปอร์เซ็นต์ส่วนลดต้องไม่เกิน 100" });
  }
  if (new Date(value.endDate) < new Date(value.startDate)) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น" });
  }
});

// GET /api/promotions
export async function GET() {
  try {
    const result = await db
      .select()
      .from(promotions)
      .where(eq(promotions.isActive, true));
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// POST /api/promotions
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = promotionSchema.parse(body);

    const newPromotion: NewPromotion = {
      ...validated,
      value:     String(validated.value),
      startDate: new Date(validated.startDate),
      endDate:   new Date(validated.endDate),
      isActive:  true,
    };

    const result = await db.insert(promotions).values(newPromotion);
    return NextResponse.json(
      { message: "Promotion created", id: result[0].insertId },
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
