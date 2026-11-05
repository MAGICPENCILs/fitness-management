import { BarChart3, Download, Percent, ReceiptText, UserPlus, UsersRound } from "lucide-react";
import { PrintButton } from "@/components/reports/print-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentBranchId } from "@/lib/branch-service";
import { parseReportRange, REPORT_TYPES, type ReportType } from "@/lib/report-policy";
import { getAdvancedReports } from "@/lib/reports";
import { requirePermission } from "@/lib/staff-service";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: 2 });
const statusLabels: Record<string, string> = { ACTIVE: "ใช้งาน", EXPIRED: "หมดอายุ", FROZEN: "แช่แข็ง", SUSPENDED: "ระงับ", CANCELLED: "ยกเลิก" };
const reportLabels: Record<ReportType, string> = { members: "สมาชิก", "peak-hours": "ช่วงพีค", promotions: "โปรโมชัน", vat: "VAT", workforce: "Workforce" };

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** โหลดรายงานทุกชุดด้วยสาขาและช่วงวันที่ที่ผ่าน validation ชุดเดียวกัน */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const now = new Date();
  const defaultFrom = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const from = typeof params.from === "string" ? params.from : defaultFrom;
  const to = typeof params.to === "string" ? params.to : localDate(now);
  let range; let rangeAdjusted = false;
  try { range = parseReportRange(from, to); } catch { range = parseReportRange(defaultFrom, localDate(now)); rangeAdjusted = true; }
  const branchId = await getCurrentBranchId();
  await requirePermission("audit.read", branchId);
  const report = await getAdvancedReports(branchId, range);
  const topHour = report.peakHours.reduce((best, row) => row.visits > (best?.visits ?? -1) ? row : best, report.peakHours[0]);
  const exportHref = (type: ReportType) => `/api/reports/export?type=${type}&from=${range.from}&to=${range.to}`;

  return <div className="report-print-page mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8 print:max-w-none print:p-0">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-1 text-sm font-medium text-primary">วิเคราะห์ผลการดำเนินงาน</p><h1 className="text-2xl font-bold sm:text-3xl">รายงานขั้นสูง</h1><p className="mt-1 text-sm text-muted-foreground">ข้อมูลสาขาปัจจุบัน ตั้งแต่ {range.from} ถึง {range.to}</p></div><div className="print:hidden"><PrintButton /></div></header>
    {rangeAdjusted ? <p role="alert" className="rounded-lg border border-warning/30 bg-warning-surface p-3 text-sm text-warning-foreground print:hidden">ช่วงวันที่เดิมไม่ถูกต้อง ระบบจึงแสดงข้อมูลของเดือนปัจจุบัน</p> : null}
    <form method="get" className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto] print:hidden"><div><Label htmlFor="report-from">วันที่เริ่มต้น</Label><Input id="report-from" name="from" type="date" defaultValue={range.from} required /></div><div><Label htmlFor="report-to">วันที่สิ้นสุด</Label><Input id="report-to" name="to" type="date" defaultValue={range.to} required /></div><Button className="self-end" type="submit">แสดงรายงาน</Button></form>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="สรุปรายงาน"><StatCard label="สมาชิกทั้งหมด" value={report.members.total.toLocaleString("th-TH")} icon={UsersRound} tone="primary" /><StatCard label="สมาชิกใหม่ในช่วง" value={report.members.newInPeriod.toLocaleString("th-TH")} icon={UserPlus} tone="success" /><StatCard label="VAT" value={money.format(report.vat.vat)} icon={Percent} tone="warning" /><StatCard label="ช่วงพีค" value={topHour ? `${String(topHour.hour).padStart(2, "0")}:00 · ${topHour.visits} ครั้ง` : "ไม่มีข้อมูล"} icon={BarChart3} tone="info" /></section>
    <div className="flex flex-wrap gap-2 print:hidden">{REPORT_TYPES.map((type) => <Button key={type} asChild variant="outline" size="sm"><a href={exportHref(type)}><Download aria-hidden="true" />CSV {reportLabels[type]}</a></Button>)}</div>
    <ReportSection title="สมาชิกตามสถานะ">{report.members.statuses.length ? <Table><TableHeader><TableRow><TableHead>สถานะ</TableHead><TableHead className="text-right">จำนวน</TableHead></TableRow></TableHeader><TableBody>{report.members.statuses.map((row) => <TableRow key={row.status}><TableCell><Badge variant="outline">{statusLabels[row.status] ?? row.status}</Badge></TableCell><TableCell className="text-right tabular-nums">{row.count.toLocaleString("th-TH")}</TableCell></TableRow>)}</TableBody></Table> : <Empty text="ยังไม่มีข้อมูลสมาชิกในสาขานี้" />}</ReportSection>
    <ReportSection title="จำนวนเข้าใช้ตามชั่วโมง">{report.peakHours.length ? <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">{report.peakHours.map((row) => <div key={row.hour} className="rounded-lg bg-muted p-3"><div className="flex justify-between text-sm"><span>{String(row.hour).padStart(2, "0")}:00–{String((row.hour + 1) % 24).padStart(2, "0")}:00</span><strong className="tabular-nums">{row.visits}</strong></div><div className="mt-2 h-2 rounded-full bg-background"><div className="h-full rounded-full bg-info" style={{ width: `${Math.max(6, row.visits / Math.max(...report.peakHours.map((item) => item.visits)) * 100)}%` }} /></div></div>)}</div> : <Empty text="ไม่มีการเข้าใช้ที่อนุมัติในช่วงนี้" />}</ReportSection>
    <ReportSection title="ประสิทธิผลโปรโมชัน">{report.promotions.length ? <Table><TableHeader><TableRow><TableHead>โปรโมชัน</TableHead><TableHead className="text-right">ใช้</TableHead><TableHead className="text-right">ส่วนลด</TableHead><TableHead className="text-right">รายรับ</TableHead></TableRow></TableHeader><TableBody>{report.promotions.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.name}</TableCell><TableCell className="text-right tabular-nums">{row.uses}</TableCell><TableCell className="text-right tabular-nums">{money.format(row.discount)}</TableCell><TableCell className="text-right tabular-nums">{money.format(row.revenue)}</TableCell></TableRow>)}</TableBody></Table> : <Empty text="ไม่มีการใช้โปรโมชันในช่วงนี้" />}</ReportSection>
    <ReportSection title="สรุป VAT จากเอกสารที่ออก" icon={<ReceiptText className="size-5" aria-hidden="true" />}><div className="grid gap-4 p-5 sm:grid-cols-4"><Metric label="เอกสาร" value={`${report.vat.documents} ฉบับ`} /><Metric label="ก่อน VAT" value={money.format(report.vat.subtotal)} /><Metric label="VAT" value={money.format(report.vat.vat)} /><Metric label="รวม" value={money.format(report.vat.total)} /></div></ReportSection>
    <ReportSection title="Workforce" description="Payroll เฉพาะรายการที่อนุมัติแล้ว ไม่รวมภาษี/ประกันสังคม">{report.workforce.length ? <Table><TableHeader><TableRow><TableHead>พนักงาน</TableHead><TableHead className="text-right">IN</TableHead><TableHead className="text-right">OUT</TableHead><TableHead className="text-right">Payroll</TableHead></TableRow></TableHeader><TableBody>{report.workforce.map((row) => <TableRow key={row.staffId}><TableCell><strong>{row.staffCode}</strong><span className="ml-2 text-muted-foreground">{row.firstName} {row.lastName}</span></TableCell><TableCell className="text-right tabular-nums">{row.inCount}</TableCell><TableCell className="text-right tabular-nums">{row.outCount}</TableCell><TableCell className="text-right tabular-nums">{money.format(row.approvedPayroll)}</TableCell></TableRow>)}</TableBody></Table> : <Empty text="ไม่มีข้อมูลลงเวลาในช่วงนี้" />}</ReportSection>
  </div>;
}

function ReportSection({ title, description, icon, children }: { title: string; description?: string; icon?: React.ReactNode; children: React.ReactNode }) { return <section className="break-inside-avoid rounded-xl border bg-card shadow-sm"><div className="border-b p-5"><h2 className="flex items-center gap-2 font-semibold">{icon}{title}</h2>{description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}</div>{children}</section>; }
function Empty({ text }: { text: string }) { return <p className="p-8 text-center text-sm text-muted-foreground">{text}</p>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p></div>; }
