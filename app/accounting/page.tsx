import { AccountingManager } from "@/components/accounting/accounting-manager";
import { getAccountingSnapshot } from "@/lib/accounting";

export const dynamic = "force-dynamic";

/** สร้างช่วงเดือนปัจจุบันตามเวลาไทย เพื่อให้รายงานเริ่มต้นตรงกับวันทำการของสาขา */
function getCurrentBangkokPeriod() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const today = `${values.year}-${values.month}-${values.day}`;
  const lastDay = new Date(Date.UTC(Number(values.year), Number(values.month), 0)).getUTCDate();
  return { today, from: `${values.year}-${values.month}-01`, to: `${values.year}-${values.month}-${String(lastDay).padStart(2, "0")}` };
}

/** โหลดข้อมูลบัญชีจากฐานข้อมูลโดยตรงใน Server Component เพื่อลดการเรียก API ซ้ำตอนเปิดหน้า */
export default async function AccountingPage() {
  const period = getCurrentBangkokPeriod();
  const snapshot = await getAccountingSnapshot(period.from, period.to);
  return (
    <div className="w-full max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      <header>
        <p className="mb-1 text-sm font-medium text-primary">การเงินและการดำเนินงาน</p>
        <h1 className="text-balance text-2xl font-bold sm:text-3xl">ระบบบัญชี</h1>
        <p className="mt-1 max-w-3xl text-pretty text-sm text-muted-foreground">ติดตามรายรับอัตโนมัติ บันทึกรายจ่าย ตรวจงบกำไรขาดทุน และกระทบยอดเงินสดประจำวัน</p>
      </header>
      <AccountingManager initialSnapshot={snapshot} today={period.today} />
    </div>
  );
}
