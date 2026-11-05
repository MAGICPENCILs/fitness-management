import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarDays, Clock3, Dumbbell, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PortalActions } from "@/components/member-portal/portal-actions";
import { getMemberPortalDashboard, MemberSessionError, requireMemberSession } from "@/lib/member-auth/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Member Portal | Fitness Pro", description: "ดูแพ็กเกจ ประวัติ และ QR เข้าใช้บริการ" };

/** บังคับ Member session จากฐานข้อมูลก่อนโหลดข้อมูล self-service ตาม memberId ใน session เท่านั้น */
export default async function MemberPortalPage() {
  let session;
  try { session = await requireMemberSession(); } catch (error) { if (error instanceof MemberSessionError) redirect("/member-login"); throw error; }
  const dashboard = await getMemberPortalDashboard(session.memberId);
  return <main className="min-h-screen bg-background p-4 sm:p-6 lg:p-8"><div className="mx-auto max-w-5xl space-y-8">
    <header className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-primary to-info p-6 text-primary-foreground shadow-lg sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm opacity-90">{session.memberCode}</p><h1 className="text-2xl font-bold">สวัสดี {session.firstName} {session.lastName}</h1><p className="mt-1 text-sm opacity-90">สถานะสมาชิก: {session.memberStatus}</p></div><Dumbbell className="size-12 opacity-80" /></header>
    <section className="rounded-xl border bg-card p-5"><h2 className="mb-4 flex items-center gap-2 font-semibold"><Dumbbell className="size-5 text-primary" />แพ็กเกจของฉัน</h2><div className="grid gap-3 sm:grid-cols-2">{dashboard.packages.length ? dashboard.packages.map((item) => <article key={item.id} className="rounded-lg bg-muted p-4"><div className="flex justify-between gap-3"><strong>{item.packageName}</strong><Badge>{item.status}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{new Date(item.startDate).toLocaleDateString("th-TH")} – {new Date(item.expireDate).toLocaleDateString("th-TH")}</p></article>) : <p className="text-sm text-muted-foreground">ยังไม่มีแพ็กเกจที่อนุมัติ</p>}</div></section>
    <PortalActions />
    <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-xl border bg-card p-5"><h2 className="mb-4 flex items-center gap-2 font-semibold"><History className="size-5 text-info" />ประวัติเข้าใช้ล่าสุด</h2><div className="space-y-3">{dashboard.visits.length ? dashboard.visits.map((visit) => <div key={visit.id} className="flex justify-between gap-3 border-b pb-3 text-sm"><span>{visit.result === "APPROVED" ? "เข้าใช้สำเร็จ" : visit.reason ?? "ไม่อนุญาต"}</span><time className="text-muted-foreground">{visit.scannedAt?.toLocaleString("th-TH")}</time></div>) : <p className="text-sm text-muted-foreground">ยังไม่มีประวัติ</p>}</div></section>
    <section className="rounded-xl border bg-card p-5"><h2 className="mb-4 flex items-center gap-2 font-semibold"><CalendarDays className="size-5 text-success" />คลาสที่จอง</h2><div className="space-y-3">{dashboard.bookings.length ? dashboard.bookings.map((booking) => <div key={booking.id} className="rounded-lg bg-muted p-3"><div className="flex justify-between"><strong>{booking.className}</strong><Badge variant="outline">{booking.status}</Badge></div><p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><Clock3 className="size-3" />{new Date(booking.classDate).toLocaleDateString("th-TH")} {booking.startTime} · {booking.room}</p></div>) : <p className="text-sm text-muted-foreground">ยังไม่มีคลาสที่จอง</p>}</div></section></div>
  </div></main>;
}
