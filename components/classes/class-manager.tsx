"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  History,
  MapPin,
  Plus,
  Sparkles,
  UserRoundCheck,
  UsersRound,
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

type ClassCategory = "YOGA" | "ZUMBA" | "SPINNING" | "STRENGTH" | "OTHER";
type ClassStatus = "SCHEDULED" | "CANCELLED" | "COMPLETED";
type BookingStatus = "CONFIRMED" | "CANCELLED" | "ATTENDED" | "NO_SHOW";

type TrainerItem = {
  id: number;
  code: string;
  firstName: string;
  lastName: string;
  specialty: string;
  phone: string | null;
};

type MemberOption = {
  id: number;
  memberCode: string;
  firstName: string;
  lastName: string;
};

type ClassItem = {
  id: number;
  trainerId: number;
  name: string;
  category: ClassCategory;
  room: string;
  classDate: string;
  startTime: string;
  endTime: string;
  capacity: number;
  status: ClassStatus;
  note: string | null;
  trainerCode: string;
  trainerFirstName: string;
  trainerLastName: string;
  bookedCount: number;
};

type BookingHistory = {
  id: number;
  classId: number;
  className: string;
  classDate: string;
  startTime: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  status: BookingStatus;
  bookedAt: string | null;
  cancelledAt: string | null;
};

const categoryLabels: Record<ClassCategory, string> = {
  YOGA: "โยคะ",
  ZUMBA: "ซุมบ้า",
  SPINNING: "สปินนิ่ง",
  STRENGTH: "เสริมความแข็งแรง",
  OTHER: "อื่น ๆ",
};

const statusLabels: Record<BookingStatus, string> = {
  CONFIRMED: "ยืนยันแล้ว",
  CANCELLED: "ยกเลิก",
  ATTENDED: "เข้าเรียนแล้ว",
  NO_SHOW: "ไม่มาเรียน",
};

const dateFormat = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeZone: "Asia/Bangkok",
});

/** แสดงวันที่ฐานข้อมูลเป็นเวลาไทยโดยไม่ให้วันเลื่อนจาก timezone */
function formatDate(value: string) {
  return dateFormat.format(new Date(`${value}T00:00:00+07:00`));
}

/** คืนรูปแบบ badge ตามสถานะการจองเพื่อให้มีทั้งสีและข้อความกำกับ */
function bookingBadgeVariant(status: BookingStatus) {
  if (status === "CANCELLED" || status === "NO_SHOW") return "destructive";
  if (status === "ATTENDED") return "secondary";
  return "default";
}

/** รวมงานสร้างตาราง จอง และยกเลิกไว้ในแดชบอร์ดที่อัปเดตจาก server หลังทำรายการ */
export function ClassManager({
  classes,
  trainers,
  members,
  history,
  today,
}: {
  classes: ClassItem[];
  trainers: TrainerItem[];
  members: MemberOption[];
  history: BookingHistory[];
  today: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [trainerOpen, setTrainerOpen] = useState(false);
  const [classOpen, setClassOpen] = useState(false);
  const [bookingClass, setBookingClass] = useState<ClassItem | null>(null);
  const [cancelBooking, setCancelBooking] = useState<BookingHistory | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [trainerForm, setTrainerForm] = useState({
    code: "",
    firstName: "",
    lastName: "",
    specialty: "",
    phone: "",
    note: "",
  });
  const [classForm, setClassForm] = useState({
    trainerId: "",
    name: "",
    category: "YOGA" as ClassCategory,
    room: "Studio A",
    classDate: today,
    startTime: "09:00",
    endTime: "10:00",
    capacity: "20",
    note: "",
  });
  const [memberId, setMemberId] = useState("");

  const upcomingClasses = useMemo(
    () =>
      classes.filter(
        (item) => item.status === "SCHEDULED" && item.classDate >= today,
      ),
    [classes, today],
  );
  const confirmedCount = upcomingClasses.reduce(
    (total, item) => total + item.bookedCount,
    0,
  );
  const availableSeats = upcomingClasses.reduce(
    (total, item) => total + Math.max(0, item.capacity - item.bookedCount),
    0,
  );

  /** ส่งคำขอ JSON พร้อมแสดง feedback ที่อ่านได้ด้วย screen reader */
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

  /** เพิ่มเทรนเนอร์และล้างฟอร์มเมื่อบันทึกสำเร็จ */
  async function handleTrainerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await submitRequest("/api/trainers", trainerForm)) {
      setTrainerOpen(false);
      setTrainerForm({
        code: "",
        firstName: "",
        lastName: "",
        specialty: "",
        phone: "",
        note: "",
      });
    }
  }

  /** สร้างรอบคลาสจากข้อมูลที่กรอกและคงค่าเริ่มต้นที่ใช้ซ้ำบ่อย */
  async function handleClassSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await submitRequest("/api/classes", classForm)) {
      setClassOpen(false);
      setClassForm((current) => ({
        ...current,
        name: "",
        trainerId: "",
        note: "",
      }));
    }
  }

  /** จองสมาชิกที่เลือกกับรอบคลาสปัจจุบัน */
  async function handleBookingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bookingClass) return;
    if (
      await submitRequest(`/api/classes/${bookingClass.id}/bookings`, {
        memberId,
      })
    ) {
      setBookingClass(null);
      setMemberId("");
    }
  }

  /** ยืนยันยกเลิกรายการจองและคืนที่นั่งให้คลาส */
  async function handleCancelBooking() {
    if (!cancelBooking) return;
    if (
      await submitRequest(
        `/api/classes/${cancelBooking.classId}/bookings/${cancelBooking.id}/cancel`,
      )
    )
      setCancelBooking(null);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" aria-atomic="true" className="min-h-6">
          {feedback && (
            <p
              className={
                feedback.type === "success"
                  ? "text-sm font-medium text-success"
                  : "text-sm font-medium text-destructive"
              }
            >
              {feedback.message}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => setTrainerOpen(true)}>
            <UserRoundCheck data-icon="inline-start" aria-hidden="true" />
            เพิ่มเทรนเนอร์
          </Button>
          <Button onClick={() => setClassOpen(true)} disabled={!trainers.length}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            สร้างรอบคลาส
          </Button>
        </div>
      </div>

      <section aria-label="สรุปคลาส" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="เทรนเนอร์พร้อมสอน" value={trainers.length} icon={UserRoundCheck} tone="primary" />
        <StatCard label="รอบที่กำลังจะมาถึง" value={upcomingClasses.length} icon={CalendarDays} tone="info" />
        <StatCard label="ที่นั่งยืนยันแล้ว" value={confirmedCount} icon={UsersRound} tone="success" />
        <StatCard label="ที่นั่งว่างทั้งหมด" value={availableSeats} icon={Sparkles} tone="warning" />
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="schedule-heading">
        <div>
          <h2 id="schedule-heading" className="text-xl font-bold">ตารางคลาสที่กำลังจะมาถึง</h2>
          <p className="text-sm text-muted-foreground">ตรวจที่นั่งและจองสมาชิกได้จากแต่ละรอบ</p>
        </div>
        {upcomingClasses.length ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {upcomingClasses.map((item) => {
              const remaining = Math.max(0, item.capacity - item.bookedCount);
              const percent = Math.min(100, (item.bookedCount / item.capacity) * 100);
              return (
                <article key={item.id} className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Badge variant="secondary">{categoryLabels[item.category]}</Badge>
                      <h3 className="mt-2 truncate text-lg font-bold text-card-foreground">{item.name}</h3>
                      <p className="text-sm text-muted-foreground">โค้ช {item.trainerFirstName} {item.trainerLastName}</p>
                    </div>
                    <div className="rounded-lg bg-success-surface px-3 py-2 text-center text-success">
                      <span className="block text-lg font-bold tabular-nums">{remaining}</span>
                      <span className="block text-xs">ที่ว่าง</span>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted p-3 text-sm">
                    <div>
                      <dt className="flex items-center gap-1 text-muted-foreground"><CalendarDays className="size-4" aria-hidden="true" />วันที่</dt>
                      <dd className="mt-1 font-medium tabular-nums">{formatDate(item.classDate)}</dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-muted-foreground"><Clock3 className="size-4" aria-hidden="true" />เวลา</dt>
                      <dd className="mt-1 font-medium tabular-nums">{item.startTime}–{item.endTime}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="flex items-center gap-1 text-muted-foreground"><MapPin className="size-4" aria-hidden="true" />สถานที่</dt>
                      <dd className="mt-1 font-medium">{item.room}</dd>
                    </div>
                  </dl>
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">ยืนยัน {item.bookedCount}/{item.capacity} คน</span>
                      <span className="font-medium tabular-nums">{Math.round(percent)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`จำนวนผู้จองคลาส ${item.name}`} aria-valuemin={0} aria-valuemax={item.capacity} aria-valuenow={item.bookedCount}>
                      <div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                  <Button className="mt-auto w-full" onClick={() => setBookingClass(item)} disabled={remaining === 0}>
                    <CheckCircle2 data-icon="inline-start" aria-hidden="true" />
                    {remaining === 0 ? "คลาสเต็มแล้ว" : "จองสมาชิก"}
                  </Button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center">
            <CalendarDays className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
            <h3 className="mt-3 font-semibold">ยังไม่มีรอบคลาสที่กำลังจะมาถึง</h3>
            <p className="mt-1 text-sm text-muted-foreground">เพิ่มเทรนเนอร์แล้วสร้างรอบคลาสแรกได้ทันที</p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="trainer-heading">
        <div>
          <h2 id="trainer-heading" className="text-xl font-bold">ทีมเทรนเนอร์</h2>
          <p className="text-sm text-muted-foreground">รายชื่อผู้ฝึกสอนที่พร้อมรับตาราง</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {trainers.map((trainer) => (
            <article key={trainer.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-info-surface text-info"><UserRoundCheck className="size-5" aria-hidden="true" /></span>
                <div className="min-w-0">
                  <h3 className="font-semibold">{trainer.firstName} {trainer.lastName}</h3>
                  <p className="text-sm text-muted-foreground">{trainer.code} · {trainer.specialty}</p>
                  {trainer.phone && <p className="mt-1 text-xs text-muted-foreground">โทร {trainer.phone}</p>}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="history-heading">
        <div>
          <h2 id="history-heading" className="flex items-center gap-2 text-xl font-bold"><History className="size-5" aria-hidden="true" />ประวัติการจองล่าสุด</h2>
          <p className="text-sm text-muted-foreground">ตรวจสอบและยกเลิกรายการที่ยังยืนยันอยู่</p>
        </div>
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>สมาชิก</TableHead>
                <TableHead>คลาส</TableHead>
                <TableHead>วันและเวลา</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="text-right">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length ? history.map((booking) => (
                <TableRow key={booking.id}>
                  <TableCell><span className="block font-medium">{booking.firstName} {booking.lastName}</span><span className="text-xs text-muted-foreground">{booking.memberCode}</span></TableCell>
                  <TableCell className="font-medium">{booking.className}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatDate(booking.classDate)} · {booking.startTime}</TableCell>
                  <TableCell><Badge variant={bookingBadgeVariant(booking.status)}>{statusLabels[booking.status]}</Badge></TableCell>
                  <TableCell className="text-right">
                    {booking.status === "CONFIRMED" ? (
                      <Button variant="ghost" size="sm" onClick={() => setCancelBooking(booking)}>
                        <XCircle data-icon="inline-start" aria-hidden="true" />ยกเลิก
                      </Button>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">ยังไม่มีประวัติการจอง</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <Dialog open={trainerOpen} onOpenChange={setTrainerOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>เพิ่มเทรนเนอร์</DialogTitle><DialogDescription>สร้างโปรไฟล์ผู้ฝึกสอนเพื่อใช้จัดตารางคลาส</DialogDescription></DialogHeader>
          <form onSubmit={handleTrainerSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="รหัสเทรนเนอร์" htmlFor="trainer-code"><Input id="trainer-code" required value={trainerForm.code} onChange={(event) => setTrainerForm({ ...trainerForm, code: event.target.value.toUpperCase() })} placeholder="TR-001" /></Field>
              <Field label="ความเชี่ยวชาญ" htmlFor="trainer-specialty"><Input id="trainer-specialty" required value={trainerForm.specialty} onChange={(event) => setTrainerForm({ ...trainerForm, specialty: event.target.value })} placeholder="Yoga, Strength" /></Field>
              <Field label="ชื่อ" htmlFor="trainer-first-name"><Input id="trainer-first-name" required value={trainerForm.firstName} onChange={(event) => setTrainerForm({ ...trainerForm, firstName: event.target.value })} /></Field>
              <Field label="นามสกุล" htmlFor="trainer-last-name"><Input id="trainer-last-name" required value={trainerForm.lastName} onChange={(event) => setTrainerForm({ ...trainerForm, lastName: event.target.value })} /></Field>
              <Field label="โทรศัพท์" htmlFor="trainer-phone"><Input id="trainer-phone" value={trainerForm.phone} onChange={(event) => setTrainerForm({ ...trainerForm, phone: event.target.value })} inputMode="tel" /></Field>
              <Field label="หมายเหตุ" htmlFor="trainer-note"><Input id="trainer-note" value={trainerForm.note} onChange={(event) => setTrainerForm({ ...trainerForm, note: event.target.value })} /></Field>
            </div>
            <Button type="submit" disabled={busy}>{busy ? "กำลังบันทึก..." : "เพิ่มเทรนเนอร์"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={classOpen} onOpenChange={setClassOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>สร้างรอบคลาส</DialogTitle><DialogDescription>ระบบจะตรวจตารางทับซ้อนของเทรนเนอร์ก่อนบันทึก</DialogDescription></DialogHeader>
          <form onSubmit={handleClassSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="ชื่อคลาส" htmlFor="class-name"><Input id="class-name" required value={classForm.name} onChange={(event) => setClassForm({ ...classForm, name: event.target.value })} placeholder="Morning Flow" /></Field>
              <div className="flex flex-col gap-2"><Label htmlFor="class-category">ประเภทคลาส</Label><Select value={classForm.category} onValueChange={(value: ClassCategory) => setClassForm({ ...classForm, category: value })}><SelectTrigger id="class-category" className="w-full" aria-label="ประเภทคลาส"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{Object.entries(categoryLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
              <div className="flex flex-col gap-2 sm:col-span-2"><Label htmlFor="class-trainer">เทรนเนอร์</Label><Select value={classForm.trainerId} onValueChange={(value) => setClassForm({ ...classForm, trainerId: value })}><SelectTrigger id="class-trainer" className="w-full" aria-label="เทรนเนอร์"><SelectValue placeholder="เลือกเทรนเนอร์" /></SelectTrigger><SelectContent><SelectGroup>{trainers.map((trainer) => <SelectItem key={trainer.id} value={String(trainer.id)}>{trainer.code} · {trainer.firstName} {trainer.lastName}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
              <Field label="วันที่" htmlFor="class-date"><Input id="class-date" required type="date" min={today} value={classForm.classDate} onChange={(event) => setClassForm({ ...classForm, classDate: event.target.value })} /></Field>
              <Field label="ห้อง / พื้นที่" htmlFor="class-room"><Input id="class-room" required value={classForm.room} onChange={(event) => setClassForm({ ...classForm, room: event.target.value })} /></Field>
              <Field label="เวลาเริ่ม" htmlFor="class-start"><Input id="class-start" required type="time" value={classForm.startTime} onChange={(event) => setClassForm({ ...classForm, startTime: event.target.value })} /></Field>
              <Field label="เวลาจบ" htmlFor="class-end"><Input id="class-end" required type="time" value={classForm.endTime} onChange={(event) => setClassForm({ ...classForm, endTime: event.target.value })} /></Field>
              <Field label="ความจุ (คน)" htmlFor="class-capacity"><Input id="class-capacity" required type="number" min="1" max="500" value={classForm.capacity} onChange={(event) => setClassForm({ ...classForm, capacity: event.target.value })} /></Field>
              <Field label="หมายเหตุ" htmlFor="class-note"><Input id="class-note" value={classForm.note} onChange={(event) => setClassForm({ ...classForm, note: event.target.value })} /></Field>
            </div>
            <Button type="submit" disabled={busy || !classForm.trainerId}>{busy ? "กำลังตรวจตาราง..." : "สร้างรอบคลาส"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(bookingClass)} onOpenChange={(open) => !open && setBookingClass(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>จองสมาชิกเข้า {bookingClass?.name}</DialogTitle><DialogDescription>{bookingClass ? `${formatDate(bookingClass.classDate)} เวลา ${bookingClass.startTime} · เหลือ ${bookingClass.capacity - bookingClass.bookedCount} ที่` : "เลือกสมาชิกที่ต้องการจอง"}</DialogDescription></DialogHeader>
          <form onSubmit={handleBookingSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2"><Label htmlFor="booking-member">สมาชิก</Label><Select value={memberId} onValueChange={setMemberId}><SelectTrigger id="booking-member" className="w-full" aria-label="สมาชิก"><SelectValue placeholder="เลือกสมาชิก Active" /></SelectTrigger><SelectContent><SelectGroup>{members.map((member) => <SelectItem key={member.id} value={String(member.id)}>{member.memberCode} · {member.firstName} {member.lastName}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
            <Button type="submit" disabled={busy || !memberId}>{busy ? "กำลังยืนยัน..." : "ยืนยันการจอง"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(cancelBooking)} onOpenChange={(open) => !open && setCancelBooking(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>ยกเลิกการจองนี้หรือไม่</DialogTitle><DialogDescription>สมาชิก {cancelBooking?.firstName} {cancelBooking?.lastName} จะถูกนำออกจากคลาส {cancelBooking?.className} และที่นั่งจะกลับมาว่าง</DialogDescription></DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setCancelBooking(null)} disabled={busy}>กลับ</Button>
            <Button variant="destructive" onClick={handleCancelBooking} disabled={busy}>{busy ? "กำลังยกเลิก..." : "ยืนยันยกเลิก"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** จัดรูปแบบช่องกรอกมาตรฐานพร้อม label ที่เชื่อมกับ input */
function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-2"><Label htmlFor={htmlFor}>{label}</Label>{children}</div>;
}
