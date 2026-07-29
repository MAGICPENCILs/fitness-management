"use client";

import { FormEvent, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Banknote, Calculator, Download, Plus, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { accountingMethodLabels, expenseCategoryLabels, ExpenseCategory } from "@/lib/accounting-constants";

type Transaction = {
  id: string;
  type: "INCOME" | "EXPENSE";
  date: string | null;
  description: string;
  category: "MEMBERSHIP" | ExpenseCategory;
  method: keyof typeof accountingMethodLabels;
  referenceNumber: string | null;
  amount: number;
};

type AccountingSnapshot = {
  period: { from: string; to: string };
  summary: { totalIncome: number; totalExpense: number; netProfit: number; cashIncome: number; cashExpense: number };
  transactions: Transaction[];
};

const money = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" });

/** แสดงวันที่บัญชีแบบไทย โดยกำหนดเขตเวลาเพื่อไม่ให้รายการเที่ยงคืนเลื่อนไปวันก่อนหน้า */
function formatDate(value: string | null) {
  if (!value) return "-";
  return dateFormat.format(new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value));
}

/** รวมการกรอง บันทึกรายจ่าย และกระทบยอด เพื่อให้ผู้จัดการตรวจงานประจำวันได้จากหน้าเดียว */
export function AccountingManager({ initialSnapshot, today }: { initialSnapshot: AccountingSnapshot; today: string }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [from, setFrom] = useState(initialSnapshot.period.from);
  const [to, setTo] = useState(initialSnapshot.period.to);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [expense, setExpense] = useState({ expenseDate: today, category: "OTHER" as ExpenseCategory, amount: "", paymentMethod: "TRANSFER" as "CASH" | "TRANSFER" | "CREDIT_CARD", description: "", referenceNumber: "" });
  const [reconciliation, setReconciliation] = useState({ reconciliationDate: today, openingCash: "", actualCash: "" });
  const [reconciliationResult, setReconciliationResult] = useState<{ expectedCash: number; difference: number; status: "BALANCED" | "OVER" | "SHORT" } | null>(null);

  /** โหลดตัวเลขทุกการ์ดและตารางใหม่จากเซิร์ฟเวอร์หลังเปลี่ยนช่วงเวลาหรือเพิ่มรายการ */
  const refreshSnapshot = async (nextFrom = from, nextTo = to) => {
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/accounting?from=${encodeURIComponent(nextFrom)}&to=${encodeURIComponent(nextTo)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "ไม่สามารถโหลดข้อมูลบัญชีได้");
      setSnapshot(result);
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "ไม่สามารถโหลดข้อมูลบัญชีได้" });
    } finally {
      setLoading(false);
    }
  };

  /** ส่งรายจ่ายที่ตรวจสอบจากฟอร์มแล้ว และรีเฟรชงบกำไรขาดทุนทันทีเมื่อสำเร็จ */
  const handleExpenseSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(expense) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "ไม่สามารถบันทึกรายจ่ายได้");
      setExpense((current) => ({ ...current, amount: "", description: "", referenceNumber: "" }));
      await refreshSnapshot();
      setFeedback({ type: "success", message: result.message });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "ไม่สามารถบันทึกรายจ่ายได้" });
      setLoading(false);
    }
  };

  /** ให้เซิร์ฟเวอร์คำนวณยอดคาดการณ์จากธุรกรรมจริง แล้วแสดงผลต่างที่ต้องตรวจสอบหน้าลิ้นชักเงิน */
  const handleReconciliation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/cash-reconciliations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reconciliation) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "ไม่สามารถกระทบยอดเงินสดได้");
      setReconciliationResult(result.reconciliation);
      setFeedback({ type: "success", message: result.message });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "ไม่สามารถกระทบยอดเงินสดได้" });
    } finally {
      setLoading(false);
    }
  };

  const stats = [
    { label: "รายรับ", value: snapshot.summary.totalIncome, icon: ArrowDownLeft, tone: "text-emerald-700" },
    { label: "รายจ่าย", value: snapshot.summary.totalExpense, icon: ArrowUpRight, tone: "text-destructive" },
    { label: "กำไรสุทธิ", value: snapshot.summary.netProfit, icon: Scale, tone: snapshot.summary.netProfit >= 0 ? "text-emerald-700" : "text-destructive" },
    { label: "เงินสดสุทธิ", value: snapshot.summary.cashIncome - snapshot.summary.cashExpense, icon: Banknote, tone: "text-primary" },
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="period-heading">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <form className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,12rem)_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); void refreshSnapshot(); }}>
            <div className="space-y-1.5"><Label htmlFor="accounting-from">ตั้งแต่วันที่</Label><Input id="accounting-from" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} required /></div>
            <div className="space-y-1.5"><Label htmlFor="accounting-to">ถึงวันที่</Label><Input id="accounting-to" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} required /></div>
            <Button type="submit" disabled={loading}>แสดงผล</Button>
          </form>
          <Button variant="outline" asChild><a href={`/api/accounting/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`}><Download aria-hidden="true" />ส่งออก CSV</a></Button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="สรุปบัญชีตามช่วงวันที่">
        {stats.map((stat) => { const Icon = stat.icon; return <article key={stat.label} className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{stat.label}</p><Icon className={`size-5 ${stat.tone}`} aria-hidden="true" /></div><p className={`mt-2 text-2xl font-bold tabular-nums ${stat.tone}`}>{money.format(stat.value)}</p></article>; })}
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <form className="space-y-5 rounded-xl border bg-card p-4 shadow-sm sm:p-6" onSubmit={handleExpenseSubmit}>
          <div><h2 className="text-balance text-lg font-semibold">บันทึกรายจ่าย</h2><p className="mt-1 text-pretty text-sm text-muted-foreground">เก็บค่าน้ำ ค่าไฟ เงินเดือน ค่าซ่อม และค่าใช้จ่ายดำเนินงาน</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="expense-date">วันที่จ่าย</Label><Input id="expense-date" type="date" value={expense.expenseDate} onChange={(event) => setExpense({ ...expense, expenseDate: event.target.value })} required /></div>
            <div className="space-y-1.5"><Label htmlFor="expense-category">หมวดหมู่</Label><Select value={expense.category} onValueChange={(value: ExpenseCategory) => setExpense({ ...expense, category: value })}><SelectTrigger id="expense-category" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(expenseCategoryLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="expense-amount">จำนวนเงิน</Label><Input id="expense-amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={expense.amount} onChange={(event) => setExpense({ ...expense, amount: event.target.value })} required /></div>
            <div className="space-y-1.5"><Label htmlFor="expense-method">ช่องทางชำระ</Label><Select value={expense.paymentMethod} onValueChange={(value: "CASH" | "TRANSFER" | "CREDIT_CARD") => setExpense({ ...expense, paymentMethod: value })}><SelectTrigger id="expense-method" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CASH">เงินสด</SelectItem><SelectItem value="TRANSFER">โอนเงิน</SelectItem><SelectItem value="CREDIT_CARD">บัตรเครดิต</SelectItem></SelectContent></Select></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="expense-description">รายละเอียด</Label><Input id="expense-description" value={expense.description} onChange={(event) => setExpense({ ...expense, description: event.target.value })} placeholder="เช่น ค่าไฟประจำเดือน" maxLength={255} required /></div>
          <div className="space-y-1.5"><Label htmlFor="expense-reference">เลขอ้างอิง (ถ้ามี)</Label><Input id="expense-reference" value={expense.referenceNumber} onChange={(event) => setExpense({ ...expense, referenceNumber: event.target.value })} maxLength={100} /></div>
          <Button type="submit" disabled={loading}><Plus aria-hidden="true" />บันทึกรายจ่าย</Button>
        </form>

        <form className="space-y-5 rounded-xl border bg-card p-4 shadow-sm sm:p-6" onSubmit={handleReconciliation}>
          <div><h2 className="text-balance text-lg font-semibold">กระทบยอดเงินสดสิ้นวัน</h2><p className="mt-1 text-pretty text-sm text-muted-foreground">ระบบคำนวณเงินรับและจ่ายสดจากรายการจริงของวันที่เลือก</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="reconciliation-date">วันที่กระทบยอด</Label><Input id="reconciliation-date" type="date" value={reconciliation.reconciliationDate} onChange={(event) => setReconciliation({ ...reconciliation, reconciliationDate: event.target.value })} required /></div>
            <div className="space-y-1.5"><Label htmlFor="opening-cash">เงินสดยกมา</Label><Input id="opening-cash" type="number" inputMode="decimal" min="0" step="0.01" value={reconciliation.openingCash} onChange={(event) => setReconciliation({ ...reconciliation, openingCash: event.target.value })} required /></div>
            <div className="space-y-1.5"><Label htmlFor="actual-cash">เงินสดที่นับได้</Label><Input id="actual-cash" type="number" inputMode="decimal" min="0" step="0.01" value={reconciliation.actualCash} onChange={(event) => setReconciliation({ ...reconciliation, actualCash: event.target.value })} required /></div>
          </div>
          {reconciliationResult ? <div className="rounded-lg border bg-muted/50 p-4" role="status"><div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">ยอดที่ควรมี</span><strong className="tabular-nums">{money.format(reconciliationResult.expectedCash)}</strong></div><div className="mt-2 flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">ผลต่าง</span><strong className="tabular-nums">{money.format(reconciliationResult.difference)}</strong></div><Badge className="mt-3" variant={reconciliationResult.status === "BALANCED" ? "default" : "destructive"}>{reconciliationResult.status === "BALANCED" ? "ยอดตรง" : reconciliationResult.status === "OVER" ? "เงินเกิน" : "เงินขาด"}</Badge></div> : null}
          <Button type="submit" disabled={loading}><Calculator aria-hidden="true" />คำนวณและบันทึก</Button>
        </form>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {loading ? <p className="text-sm text-muted-foreground" role="status">กำลังประมวลผลข้อมูลบัญชี…</p> : feedback ? <p className={feedback.type === "error" ? "text-sm text-destructive" : "text-sm text-emerald-700"} role={feedback.type === "error" ? "alert" : "status"}>{feedback.message}</p> : null}
      </div>

      <section aria-labelledby="transactions-heading">
        <div className="mb-3"><h2 id="transactions-heading" className="text-balance text-lg font-semibold">สมุดรายการ</h2><p className="text-pretty text-sm text-muted-foreground">รายรับถูกบันทึกอัตโนมัติจากการชำระเงิน ส่วนรายจ่ายมาจากฟอร์มด้านบน</p></div>
        {snapshot.transactions.length ? <div className="overflow-x-auto rounded-xl border bg-card shadow-sm"><Table><TableHeader><TableRow><TableHead>วันที่</TableHead><TableHead>ประเภท</TableHead><TableHead>รายละเอียด</TableHead><TableHead>ช่องทาง</TableHead><TableHead>อ้างอิง</TableHead><TableHead className="text-right">จำนวนเงิน</TableHead></TableRow></TableHeader><TableBody>{snapshot.transactions.map((item) => <TableRow key={item.id}><TableCell className="whitespace-nowrap tabular-nums">{formatDate(item.date)}</TableCell><TableCell><Badge variant={item.type === "INCOME" ? "default" : "secondary"}>{item.type === "INCOME" ? "รายรับ" : "รายจ่าย"}</Badge></TableCell><TableCell><p className="max-w-80 truncate font-medium">{item.description}</p><p className="text-xs text-muted-foreground">{item.category === "MEMBERSHIP" ? "ค่าสมาชิก" : expenseCategoryLabels[item.category]}</p></TableCell><TableCell className="whitespace-nowrap">{accountingMethodLabels[item.method]}</TableCell><TableCell className="max-w-40 truncate tabular-nums">{item.referenceNumber || "-"}</TableCell><TableCell className={`text-right font-semibold tabular-nums ${item.type === "INCOME" ? "text-emerald-700" : "text-destructive"}`}>{item.type === "INCOME" ? "+" : "-"}{money.format(item.amount)}</TableCell></TableRow>)}</TableBody></Table></div> : <div className="rounded-xl border border-dashed bg-card p-8 text-center"><Banknote className="mx-auto size-8 text-muted-foreground" aria-hidden="true" /><p className="mt-3 font-medium">ยังไม่มีรายการในช่วงนี้</p><p className="mt-1 text-pretty text-sm text-muted-foreground">เลือกช่วงเวลาอื่น หรือบันทึกรายจ่ายรายการแรกจากฟอร์มด้านบน</p></div>}
      </section>
    </div>
  );
}
