import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuditDashboard } from "@/lib/audit-service";
import { getCurrentBranchId } from "@/lib/branch-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const auditFiltersSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  action: z.string().trim().regex(/^[A-Z0-9_.-]+$/).optional(),
  result: z.enum(["SUCCESS", "DENIED", "FAILED"]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** โหลด audit log ที่ผ่าน RBAC และตัวกรองที่ไม่รับ request body หรือ PII */
export async function GET(request: Request) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("audit.read", branchId, {
      action: "AUDIT_READ",
      entityType: "AUDIT_LOG",
    });
    const parsed = auditFiltersSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return NextResponse.json(
      await getAuditDashboard(actor, {
        ...parsed,
        from: parsed.from ? new Date(`${parsed.from}T00:00:00`) : undefined,
        to: parsed.to ? new Date(`${parsed.to}T23:59:59.999`) : undefined,
      }),
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: "ตัวกรอง audit ไม่ถูกต้อง" }, { status: 400 });
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถโหลด audit log ได้" }, { status: 500 });
  }
}
