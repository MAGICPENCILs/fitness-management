import { z } from "zod";
import { getCurrentBranchId } from "@/lib/branch-service";
import { parseReportRange, REPORT_TYPES } from "@/lib/report-policy";
import { exportReportCsv, getAdvancedReports } from "@/lib/reports";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const querySchema = z.object({ type: z.enum(REPORT_TYPES), from: z.string(), to: z.string() });

/** ส่งออก CSV จาก query ชุดเดียวกับหน้ารายงานและบังคับสิทธิ์/สาขาที่ server */
export async function GET(request: Request) {
  try {
    const branchId = await getCurrentBranchId(); await requirePermission("audit.read", branchId);
    const input = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const range = parseReportRange(input.from, input.to);
    const csv = exportReportCsv(input.type, await getAdvancedReports(branchId, range));
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${input.type}-${input.from}-${input.to}.csv"` } });
  } catch (error) {
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError || (error instanceof Error && error.message.startsWith("REPORT_"))) return Response.json({ error: "รูปแบบรายงานหรือช่วงวันที่ไม่ถูกต้อง" }, { status: 400 });
    console.error(error); return Response.json({ error: "ไม่สามารถส่งออกรายงานได้" }, { status: 500 });
  }
}
