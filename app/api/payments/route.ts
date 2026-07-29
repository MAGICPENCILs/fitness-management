import { db } from "@/db";
import { payments, memberPackages, NewPayment } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const paymentSchema = z.object({
  memberId:    z.number().int().positive(),
  packageId:   z.number().int().positive(),
  amount:      z.number().positive(),
  method:      z.enum(["CASH", "QR_PROMPTPAY", "TRANSFER", "CREDIT_CARD"]),
  note:        z.string().optional(),
  startDate:   z.string(),
});

// GET /api/payments — ดึงประวัติการชำระทั้งหมด
export async function GET() {
  try {
    const result = await db.select().from(payments);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// POST /api/payments — บันทึกการชำระเงิน
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = paymentSchema.parse(body);

    // Generate receipt number
    const receiptNumber = `REC${Date.now()}`;

    // 1. บันทึก payment
    const newPayment: NewPayment = {
      memberId:      validated.memberId,
      amount:        String(validated.amount),
      method:        validated.method,
      status:        "PAID",
      note:          validated.note,
      receiptNumber,
    };

    const paymentResult = await db.insert(payments).values(newPayment);

    // 2. สร้าง member_package
    const pkgRes = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/member-packages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId:   validated.memberId,
          packageId:  validated.packageId,
          startDate:  validated.startDate,
          paidAmount: validated.amount,
        }),
      }
    );

    if (!pkgRes.ok) throw new Error("สร้างแพ็กเกจไม่สำเร็จ");

    return NextResponse.json({
      message:       "Payment successful",
      id:            paymentResult[0].insertId,
      receiptNumber,
    }, { status: 201 });

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