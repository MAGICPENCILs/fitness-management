import { AuditExplorer } from "@/components/audit/audit-explorer";
import { getAuditDashboard } from "@/lib/audit-service";
import { getBranchContext } from "@/lib/branch-service";
import { requirePermission } from "@/lib/staff-service";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** แปลง URL filters เป็นค่าที่จำกัดก่อนส่งเข้า audit service */
function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** เตรียม audit explorer จาก URL เพื่อรักษาตัวกรองเมื่อ refresh หรือย้อนกลับ */
export default async function AuditSettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const branchId = Number(first(params.branchId)) || undefined;
  const action = first(params.action)?.toUpperCase();
  const resultValue = first(params.result);
  const result = ["SUCCESS", "DENIED", "FAILED"].includes(resultValue ?? "")
    ? (resultValue as "SUCCESS" | "DENIED" | "FAILED")
    : undefined;
  const from = first(params.from);
  const to = first(params.to);
  const page = Math.max(1, Number(first(params.page)) || 1);
  const actor = await requirePermission("audit.read");
  const [data, branchContext] = await Promise.all([
    getAuditDashboard(actor, {
      branchId,
      action,
      result,
      from: from ? new Date(`${from}T00:00:00`) : undefined,
      to: to ? new Date(`${to}T23:59:59.999`) : undefined,
      page,
      pageSize: 20,
    }),
    getBranchContext(),
  ]);
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header><p className="text-sm font-medium text-primary">ตรวจสอบย้อนหลัง</p><h1 className="text-balance text-2xl font-bold sm:text-3xl">Audit log</h1><p className="mt-1 text-pretty text-muted-foreground">ติดตามผู้ดำเนินการ สาขา ผลลัพธ์ และ metadata ที่ผ่านการล้าง PII</p></header>
      <AuditExplorer
        rows={data.rows}
        branches={branchContext.branches.map((branch) => ({ id: branch.id, name: branch.name }))}
        filters={{ branchId, action, result, from, to }}
        pagination={data.pagination}
      />
    </div>
  );
}
