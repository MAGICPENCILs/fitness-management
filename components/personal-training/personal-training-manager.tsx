"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  ClipboardPlus,
  Dumbbell,
  History,
  TimerReset,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type PackageStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";
type SessionStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";

type PtPackageItem = {
  id: number;
  memberId: number;
  trainerId: number;
  name: string;
  totalSessions: number;
  startDate: string;
  endDate: string;
  status: PackageStatus;
  note: string | null;
  memberCode: string;
  memberFirstName: string;
  memberLastName: string;
  trainerCode: string;
  trainerFirstName: string;
  trainerLastName: string;
  completedCount: number;
  scheduledCount: number;
};

type PtSessionItem = {
  id: number;
  packageId: number;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  status: SessionStatus;
  weightKg: number | null;
  bmi: number | null;
  waistCm: number | null;
  workoutSummary: string | null;
  trainerNote: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  memberCode: string;
  memberFirstName: string;
  memberLastName: string;
  trainerCode: string;
  trainerFirstName: string;
  trainerLastName: string;
  packageName: string;
};

type MemberOption = {
  id: number;
  memberCode: string;
  firstName: string;
  lastName: string;
};

type TrainerOption = {
  id: number;
  code: string;
  firstName: string;
  lastName: string;
  specialty: string;
};

const dateFormat = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeZone: "Asia/Bangkok",
});

/** แสดงวันที่ฐานข้อมูลเป็นเวลาไทยโดยไม่ให้วันเลื่อนจาก timezone */
function formatDate(value: string) {
  return dateFormat.format(new Date(`${value}T00:00:00+07:00`));
}

/** บอกสถานะแพ็กเกจตามข้อมูลและวันหมดอายุจริงเพื่อไม่ให้สิทธิ์หมดอายุดู Active */
function getPackageState(item: PtPackageItem, today: string) {
  if (item.status === "COMPLETED") return "COMPLETED";
  if (item.status === "CANCELLED") return "CANCELLED";
  if (item.endDate < today) return "EXPIRED";
  return "ACTIVE";
}

/** แสดงหน่วยเมตริกโดยคงตำแหน่งทศนิยมให้อ่านเปรียบเทียบง่าย */
function formatMetric(value: number | null, unit: string) {
  return value === null ? "—" : `${value.toLocaleString("th-TH")} ${unit}`;
}

/** รวมการออกสิทธิ์ นัดหมาย ปิดงาน และดูผลการฝึกไว้ในแดชบอร์ดเดียว */
export function PersonalTrainingManager({
  packages,
  sessions,
  members,
  trainers,
  today,
}: {
  packages: PtPackageItem[];
  sessions: PtSessionItem[];
  members: MemberOption[];
  trainers: TrainerOption[];
  today: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [packageOpen, setPackageOpen] = useState(false);
  const [schedulePackage, setSchedulePackage] = useState<PtPackageItem | null>(null);
  const [resultSession, setResultSession] = useState<PtSessionItem | null>(null);
  const [cancelSession, setCancelSession] = useState<PtSessionItem | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [packageForm, setPackageForm] = useState({
    memberId: "",
    trainerId: "",
    name: "PT 10 Sessions",
    totalSessions: "10",
    startDate: today,
    endDate: today,
    note: "",
  });
  const [scheduleForm, setScheduleForm] = useState({
    scheduledDate: today,
    startTime: "09:00",
    endTime: "10:00",
  });
  const [resultForm, setResultForm] = useState({
    weightKg: "",
    bmi: "",
    waistCm: "",
    workoutSummary: "",
    trainerNote: "",
  });

  const activePackages = packages.filter(
    (item) => getPackageState(item, today) === "ACTIVE",
  );
  const pendingSessions = useMemo(
    () =>
      sessions
        .filter((item) => item.status === "SCHEDULED")
        .sort((a, b) =>
          `${a.scheduledDate}${a.startTime}`.localeCompare(
            `${b.scheduledDate}${b.startTime}`,
          ),
        ),
    [sessions],
  );
  const completedSessions = sessions.filter(
    (item) => item.status === "COMPLETED",
  );
  const remainingSessions = activePackages.reduce(
    (total, item) => total + Math.max(0, item.totalSessions - item.completedCount),
    0,
  );

  /** เปิดฟอร์มนัดพร้อมตั้งวันเริ่มต้นให้อยู่ในช่วงอายุของแพ็กเกจ */
  function openSchedule(item: PtPackageItem) {
    setScheduleForm((current) => ({
      ...current,
      scheduledDate: item.startDate > today ? item.startDate : today,
    }));
    setSchedulePackage(item);
  }

  /** ส่งคำขอ JSON พร้อมสถานะรอและ feedback ที่ screen reader รับรู้ได้ */
  async function submitRequest(url: string, body?: unknown) {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "ทำรายการไม่สำเร็จ");
      setFeedback({ type: "success", message: result.message || "บันทึกแล้ว" });
      router.refresh();
      return true;
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** ออก PT Package ใหม่แล้วรีเซ็ตผู้รับสิทธิ์เพื่อป้องกันการออกซ้ำโดยไม่ตั้งใจ */
  async function handlePackageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await submitRequest("/api/pt/packages", packageForm)) {
      setPackageOpen(false);
      setPackageForm((current) => ({
        ...current,
        memberId: "",
        trainerId: "",
        note: "",
      }));
    }
  }

  /** นัด session สำหรับแพ็กเกจที่เลือกและปิด dialog เมื่อสำเร็จ */
  async function handleScheduleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!schedulePackage) return;
    if (
      await submitRequest(
        `/api/pt/packages/${schedulePackage.id}/sessions`,
        scheduleForm,
      )
    )
      setSchedulePackage(null);
  }

  /** บันทึกผลและใช้สิทธิ์หนึ่งครั้งเมื่อเทรนเนอร์ยืนยันว่าจบ session */
  async function handleResultSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resultSession) return;
    if (
      await submitRequest(
        `/api/pt/sessions/${resultSession.id}/complete`,
        resultForm,
      )
    ) {
      setResultSession(null);
      setResultForm({
        weightKg: "",
        bmi: "",
        waistCm: "",
        workoutSummary: "",
        trainerNote: "",
      });
    }
  }

  /** ยืนยันยกเลิกนัดที่ยังไม่ฝึกเพื่อคืนโควตาการนัดหมาย */
  async function handleCancelSession() {
    if (!cancelSession) return;
    if (await submitRequest(`/api/pt/sessions/${cancelSession.id}/cancel`))
      setCancelSession(null);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" aria-atomic="true" className="min-h-6">
          {feedback && (
            <p
              className={cn(
                "text-sm font-medium",
                feedback.type === "success"
                  ? "text-success"
                  : "text-destructive",
              )}
            >
              {feedback.message}
            </p>
          )}
        </div>
        <Button
          onClick={() => setPackageOpen(true)}
          disabled={!members.length || !trainers.length}
        >
          <ClipboardPlus data-icon="inline-start" aria-hidden="true" />
          ออก PT Package
        </Button>
      </div>

      <section
        aria-label="สรุป PT"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard label="แพ็กเกจ Active" value={activePackages.length} icon={Dumbbell} tone="primary" />
        <StatCard label="นัดรอดำเนินการ" value={pendingSessions.length} icon={CalendarClock} tone="info" />
        <StatCard label="Session คงเหลือ" value={remainingSessions} icon={TimerReset} tone="warning" />
        <StatCard label="ฝึกสำเร็จทั้งหมด" value={completedSessions.length} icon={CheckCircle2} tone="success" />
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="packages-heading">
        <div>
          <h2 id="packages-heading" className="text-xl font-bold">สิทธิ์ PT ของสมาชิก</h2>
          <p className="text-sm text-muted-foreground">ดูจำนวนใช้ไป คงเหลือ และโควตาที่ยังนัดได้</p>
        </div>
        {packages.length ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {packages.map((item) => {
              const state = getPackageState(item, today);
              const remaining = Math.max(0, item.totalSessions - item.completedCount);
              const availableToSchedule = Math.max(
                0,
                item.totalSessions - item.completedCount - item.scheduledCount,
              );
              const percent = Math.min(
                100,
                (item.completedCount / item.totalSessions) * 100,
              );
              return (
                <article key={item.id} className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Badge variant={state === "ACTIVE" ? "default" : state === "COMPLETED" ? "secondary" : "destructive"}>
                        {state === "ACTIVE" ? "Active" : state === "COMPLETED" ? "ใช้ครบแล้ว" : state === "EXPIRED" ? "หมดอายุ" : "ยกเลิก"}
                      </Badge>
                      <h3 className="mt-2 truncate text-lg font-bold">{item.name}</h3>
                      <p className="text-sm text-muted-foreground">{item.memberCode} · {item.memberFirstName} {item.memberLastName}</p>
                    </div>
                    <div className="rounded-lg bg-info-surface px-3 py-2 text-center text-info">
                      <span className="block text-lg font-bold tabular-nums">{remaining}</span>
                      <span className="block text-xs">ครั้งคงเหลือ</span>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted p-3 text-sm">
                    <div><dt className="text-muted-foreground">เทรนเนอร์</dt><dd className="mt-1 font-medium">{item.trainerFirstName} {item.trainerLastName}</dd></div>
                    <div><dt className="text-muted-foreground">นัดไว้</dt><dd className="mt-1 font-medium tabular-nums">{item.scheduledCount} ครั้ง</dd></div>
                    <div className="col-span-2"><dt className="text-muted-foreground">อายุแพ็กเกจ</dt><dd className="mt-1 font-medium tabular-nums">{formatDate(item.startDate)} – {formatDate(item.endDate)}</dd></div>
                  </dl>
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs"><span className="text-muted-foreground">ใช้แล้ว {item.completedCount}/{item.totalSessions} ครั้ง</span><span className="font-medium tabular-nums">{Math.round(percent)}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`การใช้สิทธิ์ ${item.name}`} aria-valuemin={0} aria-valuemax={item.totalSessions} aria-valuenow={item.completedCount}>
                      <div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                  <Button className="mt-auto w-full" variant="outline" disabled={state !== "ACTIVE" || availableToSchedule === 0} onClick={() => openSchedule(item)}>
                    <CalendarClock data-icon="inline-start" aria-hidden="true" />
                    {availableToSchedule === 0 ? "นัดครบโควตาแล้ว" : `นัด PT · ว่าง ${availableToSchedule} ครั้ง`}
                  </Button>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={Dumbbell} title="ยังไม่มี PT Package" description="ออกแพ็กเกจแรกให้สมาชิกที่ Active เพื่อเริ่มนัดหมาย" />
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="upcoming-heading">
        <div>
          <h2 id="upcoming-heading" className="text-xl font-bold">นัด PT ที่รอดำเนินการ</h2>
          <p className="text-sm text-muted-foreground">รวมทั้งนัดถัดไปและนัดเก่าที่ยังไม่ได้ปิดผล</p>
        </div>
        {pendingSessions.length ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {pendingSessions.map((session) => (
              <article key={session.id} className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-info-surface text-info"><CalendarClock className="size-5" aria-hidden="true" /></span>
                    <div><h3 className="font-semibold">{session.memberFirstName} {session.memberLastName}</h3><p className="text-sm text-muted-foreground tabular-nums">{formatDate(session.scheduledDate)} · {session.startTime}–{session.endTime}</p><p className="mt-1 text-xs text-muted-foreground">โค้ช {session.trainerFirstName} · {session.packageName}</p></div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setCancelSession(session)}><XCircle data-icon="inline-start" aria-hidden="true" />ยกเลิก</Button>
                    <Button size="sm" onClick={() => setResultSession(session)} disabled={session.scheduledDate > today}><CheckCircle2 data-icon="inline-start" aria-hidden="true" />{session.scheduledDate > today ? "ยังไม่ถึงวันนัด" : "บันทึกผล"}</Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={CalendarClock} title="ยังไม่มีนัด PT" description="เลือกแพ็กเกจ Active แล้วกำหนดวันและเวลาฝึก" />
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="results-heading">
        <div>
          <h2 id="results-heading" className="flex items-center gap-2 text-xl font-bold"><History className="size-5" aria-hidden="true" />ประวัติผลการฝึก</h2>
          <p className="text-sm text-muted-foreground">เรียงจาก session ล่าสุดเพื่อเทียบพัฒนาการตามช่วงเวลา</p>
        </div>
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader><TableRow><TableHead>สมาชิก</TableHead><TableHead>วันที่</TableHead><TableHead>น้ำหนัก</TableHead><TableHead>BMI</TableHead><TableHead>รอบเอว</TableHead><TableHead>สรุปการฝึก</TableHead></TableRow></TableHeader>
            <TableBody>
              {completedSessions.length ? completedSessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell><span className="block font-medium">{session.memberFirstName} {session.memberLastName}</span><span className="text-xs text-muted-foreground">{session.memberCode}</span></TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatDate(session.scheduledDate)}</TableCell>
                  <TableCell className="tabular-nums">{formatMetric(session.weightKg, "กก.")}</TableCell>
                  <TableCell className="tabular-nums">{formatMetric(session.bmi, "")}</TableCell>
                  <TableCell className="tabular-nums">{formatMetric(session.waistCm, "ซม.")}</TableCell>
                  <TableCell className="min-w-56"><span className="block font-medium">{session.workoutSummary || "—"}</span>{session.trainerNote && <span className="mt-1 block text-xs text-muted-foreground">หมายเหตุ: {session.trainerNote}</span>}</TableCell>
                </TableRow>
              )) : <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">ยังไม่มีผลการฝึกที่บันทึก</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </section>

      <Dialog open={packageOpen} onOpenChange={setPackageOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>ออก PT Package</DialogTitle><DialogDescription>ผูกสิทธิ์กับสมาชิกและเทรนเนอร์ประจำแพ็กเกจ</DialogDescription></DialogHeader>
          <form onSubmit={handlePackageSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField label="สมาชิก" id="pt-member" value={packageForm.memberId} placeholder="เลือกสมาชิก Active" onValueChange={(value) => setPackageForm({ ...packageForm, memberId: value })}>{members.map((member) => <SelectItem key={member.id} value={String(member.id)}>{member.memberCode} · {member.firstName} {member.lastName}</SelectItem>)}</SelectField>
              <SelectField label="เทรนเนอร์" id="pt-trainer" value={packageForm.trainerId} placeholder="เลือกเทรนเนอร์" onValueChange={(value) => setPackageForm({ ...packageForm, trainerId: value })}>{trainers.map((trainer) => <SelectItem key={trainer.id} value={String(trainer.id)}>{trainer.code} · {trainer.firstName} {trainer.lastName}</SelectItem>)}</SelectField>
              <Field label="ชื่อแพ็กเกจ" htmlFor="pt-name"><Input id="pt-name" required value={packageForm.name} onChange={(event) => setPackageForm({ ...packageForm, name: event.target.value })} /></Field>
              <Field label="จำนวนครั้ง" htmlFor="pt-total"><Input id="pt-total" required type="number" min="1" max="100" value={packageForm.totalSessions} onChange={(event) => setPackageForm({ ...packageForm, totalSessions: event.target.value })} /></Field>
              <Field label="วันที่เริ่ม" htmlFor="pt-start"><Input id="pt-start" required type="date" value={packageForm.startDate} onChange={(event) => setPackageForm({ ...packageForm, startDate: event.target.value })} /></Field>
              <Field label="วันหมดอายุ" htmlFor="pt-end"><Input id="pt-end" required type="date" min={packageForm.startDate} value={packageForm.endDate} onChange={(event) => setPackageForm({ ...packageForm, endDate: event.target.value })} /></Field>
              <div className="sm:col-span-2"><Field label="หมายเหตุ" htmlFor="pt-note"><Input id="pt-note" value={packageForm.note} onChange={(event) => setPackageForm({ ...packageForm, note: event.target.value })} /></Field></div>
            </div>
            <Button type="submit" disabled={busy || !packageForm.memberId || !packageForm.trainerId}>{busy ? "กำลังออกสิทธิ์..." : "ยืนยันออก PT Package"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(schedulePackage)} onOpenChange={(open) => !open && setSchedulePackage(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>นัด PT Session</DialogTitle><DialogDescription>{schedulePackage ? `${schedulePackage.memberFirstName} ${schedulePackage.memberLastName} · โค้ช ${schedulePackage.trainerFirstName}` : "กำหนดวันและเวลาฝึก"}</DialogDescription></DialogHeader>
          <form onSubmit={handleScheduleSubmit} className="flex flex-col gap-4">
            <Field label="วันที่นัด" htmlFor="session-date"><Input id="session-date" required type="date" min={schedulePackage && schedulePackage.startDate > today ? schedulePackage.startDate : today} max={schedulePackage?.endDate} value={scheduleForm.scheduledDate} onChange={(event) => setScheduleForm({ ...scheduleForm, scheduledDate: event.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4"><Field label="เวลาเริ่ม" htmlFor="session-start"><Input id="session-start" required type="time" value={scheduleForm.startTime} onChange={(event) => setScheduleForm({ ...scheduleForm, startTime: event.target.value })} /></Field><Field label="เวลาจบ" htmlFor="session-end"><Input id="session-end" required type="time" value={scheduleForm.endTime} onChange={(event) => setScheduleForm({ ...scheduleForm, endTime: event.target.value })} /></Field></div>
            <Button type="submit" disabled={busy}>{busy ? "กำลังตรวจตาราง..." : "ยืนยันนัดหมาย"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(resultSession)} onOpenChange={(open) => !open && setResultSession(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>บันทึกผล PT Session</DialogTitle><DialogDescription>{resultSession ? `${resultSession.memberFirstName} ${resultSession.memberLastName} · ${formatDate(resultSession.scheduledDate)}` : "กรอกผลหลังจบการฝึก"}</DialogDescription></DialogHeader>
          <form onSubmit={handleResultSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="น้ำหนัก (กก.)" htmlFor="result-weight"><Input id="result-weight" type="number" min="20" max="500" step="0.01" inputMode="decimal" value={resultForm.weightKg} onChange={(event) => setResultForm({ ...resultForm, weightKg: event.target.value })} /></Field>
              <Field label="BMI" htmlFor="result-bmi"><Input id="result-bmi" type="number" min="5" max="100" step="0.01" inputMode="decimal" value={resultForm.bmi} onChange={(event) => setResultForm({ ...resultForm, bmi: event.target.value })} /></Field>
              <Field label="รอบเอว (ซม.)" htmlFor="result-waist"><Input id="result-waist" type="number" min="20" max="500" step="0.01" inputMode="decimal" value={resultForm.waistCm} onChange={(event) => setResultForm({ ...resultForm, waistCm: event.target.value })} /></Field>
              <div className="sm:col-span-3"><Field label="สรุปการฝึก" htmlFor="result-summary"><Input id="result-summary" required value={resultForm.workoutSummary} onChange={(event) => setResultForm({ ...resultForm, workoutSummary: event.target.value })} placeholder="เช่น Full body strength 60 นาที" /></Field></div>
              <div className="sm:col-span-3"><Field label="หมายเหตุเทรนเนอร์" htmlFor="result-note"><Input id="result-note" value={resultForm.trainerNote} onChange={(event) => setResultForm({ ...resultForm, trainerNote: event.target.value })} /></Field></div>
            </div>
            <Button type="submit" disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึกผลและใช้สิทธิ์ 1 ครั้ง"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(cancelSession)} onOpenChange={(open) => !open && setCancelSession(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>ยกเลิกนัด PT หรือไม่</DialogTitle><DialogDescription>นัดของ {cancelSession?.memberFirstName} {cancelSession?.memberLastName} จะถูกยกเลิกและคืนโควตาให้แพ็กเกจ</DialogDescription></DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setCancelSession(null)} disabled={busy}>กลับ</Button><Button variant="destructive" onClick={handleCancelSession} disabled={busy}>{busy ? "กำลังยกเลิก..." : "ยืนยันยกเลิก"}</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** จัดช่องกรอกมาตรฐานพร้อม label ที่เชื่อมกับ input */
function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-2"><Label htmlFor={htmlFor}>{label}</Label>{children}</div>;
}

/** จัด select ให้มี label, กลุ่มตัวเลือก และความกว้างเต็มอย่างสม่ำเสมอ */
function SelectField({ label, id, value, placeholder, onValueChange, children }: { label: string; id: string; value: string; placeholder: string; onValueChange: (value: string) => void; children: React.ReactNode }) {
  return <div className="flex flex-col gap-2"><Label htmlFor={id}>{label}</Label><Select value={value} onValueChange={onValueChange}><SelectTrigger id={id} className="w-full" aria-label={label}><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent><SelectGroup>{children}</SelectGroup></SelectContent></Select></div>;
}

/** แสดง empty state พร้อมคำแนะนำขั้นถัดไปโดยไม่ใช้สีเป็นตัวสื่อความหมายเพียงอย่างเดียว */
function EmptyState({ icon: Icon, title, description }: { icon: typeof Activity; title: string; description: string }) {
  return <div className="rounded-xl border border-dashed bg-card p-8 text-center"><Icon className="mx-auto size-10 text-muted-foreground" aria-hidden="true" /><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>;
}
