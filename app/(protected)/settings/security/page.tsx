import { SecurityConsole } from "@/components/security/security-console";
import { getSecurityDashboard, type SecurityFilters } from "@/lib/auth/security-service";
import { getBranchContext } from "@/lib/branch-service";
import { requirePermission } from "@/lib/staff-service";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type SecurityTab = "sessions" | "limits" | "events";

const EVENT_ACTIONS = new Set([
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGIN_RATE_LIMITED",
  "LOGOUT_SUCCESS",
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
  "PASSWORD_CHANGED",
  "PASSWORD_RESET",
  "AUTH_RATE_LIMIT_CLEARED",
]);

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** รับเฉพาะจำนวนเต็มบวกจาก URL เพื่อไม่ส่ง offset/id ที่ฐานข้อมูลตีความไม่ได้ */
function positiveInteger(value: string | undefined) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/** รับเฉพาะวันที่ปฏิทินจริงเพื่อไม่ให้ Date normalize ค่า URL ที่ผิดไปเป็นวันอื่น */
function validDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value
    : undefined;
}

/** เตรียม dashboard จาก authoritative permission และ URL ที่ลดรูปก่อน query ทุกครั้ง */
export default async function SecuritySettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const tabValue = first(params.tab);
  const tab: SecurityTab = ["sessions", "limits", "events"].includes(tabValue ?? "")
    ? (tabValue as SecurityTab)
    : "sessions";
  const page = positiveInteger(first(params.page)) ?? 1;
  const branchId = positiveInteger(first(params.branchId));
  const staffId = positiveInteger(first(params.staffId));
  const actionValue = first(params.action)?.toUpperCase();
  const action = EVENT_ACTIONS.has(actionValue ?? "")
    ? (actionValue as SecurityFilters["action"])
    : undefined;
  const resultValue = first(params.result);
  const result = ["SUCCESS", "DENIED", "FAILED"].includes(resultValue ?? "")
    ? (resultValue as SecurityFilters["result"])
    : undefined;
  const from = validDate(first(params.from));
  const to = validDate(first(params.to));
  const actor = await requirePermission("auth.security.read");
  const [data, branchContext] = await Promise.all([
    getSecurityDashboard(actor, {
      page,
      pageSize: 20,
      branchId,
      staffId,
      action,
      result,
      from: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
      to: to ? new Date(`${to}T23:59:59.999Z`) : undefined,
    }),
    getBranchContext(),
  ]);

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header>
        <p className="text-sm font-medium text-primary">ตรวจสอบและตอบสนอง</p>
        <h1 className="text-balance text-2xl font-bold sm:text-3xl">ความปลอดภัยการเข้าสู่ระบบ</h1>
        <p className="mt-1 max-w-3xl text-pretty text-muted-foreground">
          ตรวจเซสชัน การจำกัดความพยายาม Login และเหตุการณ์ยืนยันตัวตนตามขอบเขตสิทธิ์ของคุณ
        </p>
        <Button asChild variant="outline" className="mt-4"><Link href="/settings/security/totp">ตั้งค่า 2FA ของฉัน</Link></Button>
      </header>
      <SecurityConsole
        data={data}
        branches={branchContext.branches.map((branch) => ({ id: branch.id, name: branch.name }))}
        filters={{ tab, branchId, staffId, action, result, from, to }}
      />
    </div>
  );
}
