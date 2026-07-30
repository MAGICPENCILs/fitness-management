import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { expenses, NewExpense } from "@/db/schema";
import { getCurrentBranchId } from "@/lib/branch-service";

const expenseSchema = z.object({
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.enum(["WATER", "ELECTRICITY", "SALARY", "REPAIR", "SUPPLIES", "OTHER"]),
  amount: z.coerce.number().positive().max(9999999999.99),
  paymentMethod: z.enum(["CASH", "TRANSFER", "CREDIT_CARD"]),
  description: z.string().trim().min(2).max(255),
  referenceNumber: z.string().trim().max(100).optional(),
  note: z.string().trim().max(1000).optional(),
});

/** บันทึกรายจ่ายเป็นรายการแยกเพื่อรักษาประวัติทางบัญชีและไม่แก้ยอดชำระของสมาชิก */
export async function POST(request: Request) {
  try {
    const validated = expenseSchema.parse(await request.json());
    const branchId = await getCurrentBranchId();
    const newExpense: NewExpense = {
      ...validated,
      branchId,
      amount: String(validated.amount),
      referenceNumber: validated.referenceNumber || null,
      note: validated.note || null,
    };
    const result = await db.insert(expenses).values(newExpense);
    return NextResponse.json({ message: "บันทึกรายจ่ายแล้ว", id: result[0].insertId }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "ข้อมูลรายจ่ายไม่ถูกต้อง", details: error.issues }, { status: 400 });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถบันทึกรายจ่ายได้" }, { status: 500 });
  }
}
