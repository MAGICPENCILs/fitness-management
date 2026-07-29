import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { couponCodes } from "@/db/schema";

const updateCouponSchema = z.object({ isActive: z.boolean() });

/** เปิดหรือปิดการใช้งานคูปองตามรหัสภายในระบบ */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const couponId = Number(id);
    if (!Number.isInteger(couponId) || couponId <= 0) {
      return NextResponse.json({ error: "รหัสคูปองไม่ถูกต้อง" }, { status: 400 });
    }
    const validated = updateCouponSchema.parse(await request.json());
    const result = await db
      .update(couponCodes)
      .set({ isActive: validated.isActive })
      .where(eq(couponCodes.id, couponId));
    if (result[0].affectedRows === 0) {
      return NextResponse.json({ error: "ไม่พบคูปอง" }, { status: 404 });
    }
    return NextResponse.json({ message: "อัปเดตคูปองแล้ว" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถอัปเดตคูปองได้" }, { status: 500 });
  }
}
