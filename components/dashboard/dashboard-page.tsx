"use client";

import { useCallback, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Banknote, RefreshCw, TrendingUp, UserCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";

import type { DashboardData } from "@/lib/dashboard-data";

const money = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-label="กำลังโหลดข้อมูลภาพรวม" aria-busy="true">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 rounded-xl border bg-muted" />
        ))}
      </div>
      <div className="h-80 rounded-xl border bg-muted" />
    </div>
  );
}

export function DashboardPage({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/dashboard");
      if (!response.ok) throw new Error("ไม่สามารถโหลดข้อมูลภาพรวมได้");
      setData(await response.json());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล");
    } finally {
      setLoading(false);
    }
  }, []);

  const monthlyRevenue = data.monthly.at(-1)?.revenue ?? 0;
  const stats = [
        { label: "สมาชิกทั้งหมด", value: data.totalMembers.toLocaleString("th-TH"), icon: Users, tone: "primary" as const },
        { label: "สมาชิกที่ใช้งาน", value: data.activeMembers.toLocaleString("th-TH"), icon: UserCheck, tone: "success" as const },
        { label: "รายรับวันนี้", value: money.format(data.todayRevenue), icon: Banknote, tone: "info" as const },
        { label: "รายรับเดือนนี้", value: money.format(monthlyRevenue), icon: TrendingUp, tone: "warning" as const },
      ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-sm font-medium text-primary">ภาพรวมกิจการ</p>
          <h1 className="text-balance text-2xl font-bold sm:text-3xl">สวัสดี, ผู้ดูแลระบบ</h1>
          <p className="mt-1 text-pretty text-sm text-muted-foreground">
            ติดตามสมาชิกและรายรับล่าสุดของ Fitness Pro
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          ข้อมูล ณ {new Intl.DateTimeFormat("th-TH", { dateStyle: "long" }).format(new Date())}
        </p>
      </header>

      {loading ? <DashboardSkeleton /> : null}

      {!loading && error ? (
        <section className="rounded-xl border border-destructive/30 bg-card p-6" role="alert">
          <h2 className="font-semibold text-destructive">โหลดข้อมูลไม่สำเร็จ</h2>
          <p className="mt-1 text-pretty text-sm text-muted-foreground">{error} กรุณาตรวจสอบฐานข้อมูลแล้วลองอีกครั้ง</p>
          <Button onClick={loadDashboard} variant="outline" className="mt-4">
            <RefreshCw className="size-4" aria-hidden="true" />
            ลองอีกครั้ง
          </Button>
        </section>
      ) : null}

      {!loading && data ? (
        <>
          <section aria-labelledby="stats-heading">
            <h2 id="stats-heading" className="sr-only">ตัวเลขสำคัญ</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-2" aria-label="แนวโน้มรายรับ">
            <article className="min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
              <h2 className="text-balance font-semibold">รายรับ 7 วันล่าสุด</h2>
              <p className="mt-1 text-pretty text-sm text-muted-foreground">
                รวม {money.format(data.daily.reduce((sum, day) => sum + day.revenue, 0))}
              </p>
              <div className="mt-5 h-72" role="img" aria-label="กราฟแท่งแสดงรายรับรายวันย้อนหลัง 7 วัน">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={data.daily} barSize={28}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                    <YAxis axisLine={false} tickLine={false} width={48} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickFormatter={(value) => `${value / 1000}k`} />
                    <Tooltip contentStyle={{ background: "var(--popover)", borderColor: "var(--border)", borderRadius: 10, color: "var(--popover-foreground)" }} cursor={{ fill: "var(--accent)" }} formatter={(value) => [money.format(Number(value)), "รายรับ"]} />
                    <Bar dataKey="revenue" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
              <h2 className="text-balance font-semibold">รายรับ 12 เดือน</h2>
              <p className="mt-1 text-pretty text-sm text-muted-foreground">ใช้ดูแนวโน้มรายรับระยะยาว</p>
              <div className="mt-5 h-72" role="img" aria-label="กราฟเส้นแสดงรายรับรายเดือนย้อนหลัง 12 เดือน">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <LineChart data={data.monthly}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                    <YAxis axisLine={false} tickLine={false} width={48} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickFormatter={(value) => `${value / 1000}k`} />
                    <Tooltip contentStyle={{ background: "var(--popover)", borderColor: "var(--border)", borderRadius: 10, color: "var(--popover-foreground)" }} formatter={(value) => [money.format(Number(value)), "รายรับ"]} />
                    <Line type="monotone" dataKey="revenue" stroke="var(--chart-2)" strokeWidth={3} dot={false} activeDot={{ r: 5, fill: "var(--chart-2)" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>
          </section>
        </>
      ) : null}
    </div>
  );
}
