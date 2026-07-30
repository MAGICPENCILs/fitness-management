import { z } from "zod";
import { accountingMethodLabels, expenseCategoryLabels } from "@/lib/accounting-constants";
import { getAccountingSnapshot } from "@/lib/accounting";
import { getCurrentBranchId } from "@/lib/branch-service";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** ครอบค่าด้วยเครื่องหมายคำพูดเพื่อป้องกัน comma และ quote ทำให้คอลัมน์ CSV เคลื่อน */
function csvCell(value: string | number | null) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

/** ส่งออกสมุดรายการรายรับรายจ่ายเป็น UTF-8 CSV ที่เปิดภาษาไทยใน Excel ได้ */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const from = dateSchema.parse(searchParams.get("from"));
    const to = dateSchema.parse(searchParams.get("to"));
    if (from > to) return Response.json({ error: "วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด" }, { status: 400 });
    const snapshot = await getAccountingSnapshot(from, to, await getCurrentBranchId());
    const rows = [
      ["วันที่", "ประเภท", "หมวดหมู่", "รายละเอียด", "ช่องทาง", "เลขอ้างอิง", "รายรับ", "รายจ่าย"],
      ...snapshot.transactions.map((item) => [
        item.date?.slice(0, 10) ?? "",
        item.type === "INCOME" ? "รายรับ" : "รายจ่าย",
        item.category === "MEMBERSHIP" ? "ค่าสมาชิก" : expenseCategoryLabels[item.category],
        item.description,
        accountingMethodLabels[item.method],
        item.referenceNumber,
        item.type === "INCOME" ? item.amount.toFixed(2) : "",
        item.type === "EXPENSE" ? item.amount.toFixed(2) : "",
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="accounting-${from}-${to}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "รูปแบบช่วงวันที่ไม่ถูกต้อง" }, { status: 400 });
    console.error(error);
    return Response.json({ error: "ไม่สามารถส่งออกข้อมูลบัญชีได้" }, { status: 500 });
  }
}
