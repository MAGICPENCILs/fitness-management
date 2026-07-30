import { desc, eq } from "drizzle-orm";
import { Banknote, CreditCard, DoorOpen, ReceiptText } from "lucide-react";
import { db } from "@/db";
import { accessLogs, members, payments } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentBranchId } from "@/lib/branch-service";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});

const methodLabel: Record<string, string> = {
  CASH: "เงินสด",
  QR_PROMPTPAY: "QR PromptPay",
  TRANSFER: "โอนเงิน",
  CREDIT_CARD: "บัตรเครดิต",
};

const statusLabel: Record<string, string> = {
  PAID: "ชำระแล้ว",
  PENDING: "รอตรวจสอบ",
  REFUNDED: "คืนเงิน",
};

export default async function ReportsPage() {
  const branchId = await getCurrentBranchId();
  const [paymentRows, latestPayments, recentAccess] = await Promise.all([
    db.select().from(payments).where(eq(payments.branchId, branchId)),
    db
      .select({
        id: payments.id,
        receiptNumber: payments.receiptNumber,
        amount: payments.amount,
        method: payments.method,
        status: payments.status,
        createdAt: payments.createdAt,
        firstName: members.firstName,
        lastName: members.lastName,
      })
      .from(payments)
      .leftJoin(members, eq(payments.memberId, members.id))
      .where(eq(payments.branchId, branchId))
      .orderBy(desc(payments.createdAt))
      .limit(10),
    db.select().from(accessLogs).where(eq(accessLogs.branchId, branchId)).orderBy(desc(accessLogs.scannedAt)).limit(100),
  ]);

  const paidPayments = paymentRows.filter((payment) => payment.status === "PAID");
  const totalRevenue = paidPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const averageReceipt = paidPayments.length ? totalRevenue / paidPayments.length : 0;
  const approvedAccess = recentAccess.filter((log) => log.result === "APPROVED").length;

  const stats = [
    { label: "รายรับสะสม", value: money.format(totalRevenue), icon: Banknote, tone: "success" as const },
    { label: "รายการชำระสำเร็จ", value: `${paidPayments.length.toLocaleString("th-TH")} รายการ`, icon: CreditCard, tone: "primary" as const },
    { label: "ยอดเฉลี่ยต่อใบเสร็จ", value: money.format(averageReceipt), icon: ReceiptText, tone: "warning" as const },
    { label: "สแกนผ่านล่าสุด", value: `${approvedAccess.toLocaleString("th-TH")} ครั้ง`, icon: DoorOpen, tone: "info" as const },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header>
        <p className="mb-1 text-sm font-medium text-primary">วิเคราะห์ผลการดำเนินงาน</p>
        <h1 className="text-balance text-2xl font-bold sm:text-3xl">รายงาน</h1>
        <p className="mt-1 text-pretty text-sm text-muted-foreground">
          สรุปรายรับและการเข้าใช้บริการจากข้อมูลในระบบ
        </p>
      </header>

      <section aria-labelledby="report-summary-heading">
        <h2 id="report-summary-heading" className="sr-only">สรุปรายงาน</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm" aria-labelledby="latest-payments-heading">
        <div className="border-b p-5">
          <h2 id="latest-payments-heading" className="font-semibold">รายการชำระเงินล่าสุด</h2>
          <p className="mt-1 text-sm text-muted-foreground">แสดง 10 รายการล่าสุด</p>
        </div>
        {latestPayments.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ใบเสร็จ</TableHead>
                <TableHead>สมาชิก</TableHead>
                <TableHead>ช่องทาง</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead>วันที่</TableHead>
                <TableHead className="text-right">ยอดชำระ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {latestPayments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="font-medium tabular-nums">{payment.receiptNumber ?? `#${payment.id}`}</TableCell>
                  <TableCell>{[payment.firstName, payment.lastName].filter(Boolean).join(" ") || "ไม่พบข้อมูล"}</TableCell>
                  <TableCell>{methodLabel[payment.method] ?? payment.method}</TableCell>
                  <TableCell>
                    <Badge variant={payment.status === "PAID" ? "default" : "outline"}>
                      {statusLabel[payment.status] ?? payment.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{payment.createdAt ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(payment.createdAt) : "-"}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{money.format(Number(payment.amount))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-8 text-center">
            <p className="font-medium">ยังไม่มีรายการชำระเงิน</p>
            <p className="mt-1 text-sm text-muted-foreground">เมื่อรับชำระ รายการล่าสุดจะแสดงที่นี่</p>
          </div>
        )}
      </section>
    </div>
  );
}
