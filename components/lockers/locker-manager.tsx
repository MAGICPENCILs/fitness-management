"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  LockKeyhole,
  Plus,
  RotateCcw,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatCard } from "@/components/ui/stat-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type LockerItem = {
  id: number;
  code: string;
  zone: string;
  status: "AVAILABLE" | "OCCUPIED";
  monthlyRate: number | null;
  note: string | null;
  rentalId: number | null;
  rentalType: "USAGE" | "MONTHLY" | null;
  startDate: string | null;
  endDate: string | null;
  rentalPrice: number | null;
  memberId: number | null;
  memberCode: string | null;
  firstName: string | null;
  lastName: string | null;
};

type MemberOption = {
  id: number;
  memberCode: string;
  firstName: string;
  lastName: string;
};
type RentalHistory = {
  id: number;
  lockerCode: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  rentalType: "USAGE" | "MONTHLY";
  startDate: string;
  endDate: string | null;
  price: number;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  checkedOutAt: string | null;
  createdAt: string | null;
};

const money = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 2,
});
const dateFormat = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeZone: "Asia/Bangkok",
});

/** จัดรูปแบบวันที่จากฐานข้อมูลโดยตรึงเขตเวลาไทยเพื่อไม่ให้วันที่เลื่อน */
function formatDate(value: string | null) {
  if (!value) return "-";
  return dateFormat.format(
    new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value),
  );
}

/** รวมงานเพิ่ม มอบ และคืนล็อกเกอร์ในมุมมองเดียวสำหรับพนักงานหน้าเคาน์เตอร์ */
export function LockerManager({
  lockers,
  members,
  history,
  today,
  monthlyEndDate,
}: {
  lockers: LockerItem[];
  members: MemberOption[];
  history: RentalHistory[];
  today: string;
  monthlyEndDate: string;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [rentOpen, setRentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmReleaseId, setConfirmReleaseId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [createForm, setCreateForm] = useState({
    code: "",
    zone: "A",
    monthlyRate: "",
    note: "",
  });
  const [rentForm, setRentForm] = useState({
    lockerId: "",
    memberId: "",
    rentalType: "USAGE" as "USAGE" | "MONTHLY",
    startDate: today,
    endDate: "",
    price: "0",
    note: "",
  });

  const availableLockers = lockers.filter(
    (locker) => locker.status === "AVAILABLE",
  );
  const occupiedLockers = lockers.filter(
    (locker) => locker.status === "OCCUPIED",
  );
  const monthlyRentals = lockers.filter(
    (locker) => locker.rentalType === "MONTHLY",
  );

  /** เลือกตู้และเติมราคาเช่ารายเดือนจากค่าตั้งของตู้ เพื่อลดการพิมพ์ยอดผิด */
  const selectLocker = (lockerId: string, rentalType = rentForm.rentalType) => {
    const locker = lockers.find((item) => item.id === Number(lockerId));
    setRentForm((current) => ({
      ...current,
      lockerId,
      rentalType,
      price:
        rentalType === "MONTHLY" && locker?.monthlyRate !== null
          ? String(locker?.monthlyRate ?? "")
          : current.price,
    }));
  };

  /** เปลี่ยนชนิดการใช้งานพร้อมกำหนดวันสิ้นสุดมาตรฐานเฉพาะการเช่ารายเดือน */
  const selectRentalType = (rentalType: "USAGE" | "MONTHLY") => {
    const locker = lockers.find(
      (item) => item.id === Number(rentForm.lockerId),
    );
    setRentForm((current) => ({
      ...current,
      rentalType,
      endDate: rentalType === "MONTHLY" ? monthlyEndDate : "",
      price: rentalType === "MONTHLY" ? String(locker?.monthlyRate ?? "") : "0",
    }));
  };

  /** เพิ่มล็อกเกอร์และรีเฟรชข้อมูลจาก Server Component เมื่อ API บันทึกสำเร็จ */
  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/lockers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "ไม่สามารถเพิ่มล็อกเกอร์ได้");
      setCreateForm({ code: "", zone: "A", monthlyRate: "", note: "" });
      setCreateOpen(false);
      setFeedback({ type: "success", message: result.message });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "ไม่สามารถเพิ่มล็อกเกอร์ได้",
      });
    } finally {
      setBusy(false);
    }
  };

  /** มอบล็อกเกอร์ให้สมาชิกและคง dialog ไว้เมื่อผิดพลาดเพื่อให้แก้ข้อมูลได้ทันที */
  const handleRent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/lockers/${rentForm.lockerId}/rent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...rentForm,
          memberId: Number(rentForm.memberId),
          price: Number(rentForm.price),
          endDate: rentForm.endDate || undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "ไม่สามารถมอบล็อกเกอร์ได้");
      setRentForm({
        lockerId: "",
        memberId: "",
        rentalType: "USAGE",
        startDate: today,
        endDate: "",
        price: "0",
        note: "",
      });
      setRentOpen(false);
      setFeedback({ type: "success", message: result.message });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "ไม่สามารถมอบล็อกเกอร์ได้",
      });
    } finally {
      setBusy(false);
    }
  };

  /** คืนตู้หลังผู้ใช้ยืนยันอีกครั้ง เพื่อป้องกันการจบ session โดยแตะพลาด */
  const handleRelease = async (lockerId: number) => {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/lockers/${lockerId}/release`, {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "ไม่สามารถคืนล็อกเกอร์ได้");
      setConfirmReleaseId(null);
      setFeedback({ type: "success", message: result.message });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "ไม่สามารถคืนล็อกเกอร์ได้",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="สรุปสถานะล็อกเกอร์"
      >
        {[
          {
            label: "ล็อกเกอร์ทั้งหมด",
            value: lockers.length,
            icon: LockKeyhole,
            tone: "primary" as const,
          },
          {
            label: "ว่างพร้อมใช้",
            value: availableLockers.length,
            icon: Check,
            tone: "success" as const,
          },
          {
            label: "กำลังใช้งาน",
            value: occupiedLockers.length,
            icon: UserRound,
            tone: "info" as const,
          },
          {
            label: "เช่ารายเดือน",
            value: monthlyRentals.length,
            icon: CalendarDays,
            tone: "warning" as const,
          },
        ].map((item) => <StatCard key={item.label} {...item} value={item.value.toLocaleString("th-TH")} />)}
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-balance text-lg font-semibold">สถานะล็อกเกอร์</h2>
          <p className="text-pretty text-sm text-muted-foreground">
            ตรวจตู้ว่าง ผู้ใช้งานปัจจุบัน และวันสิ้นสุดการเช่า
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Dialog
            open={createOpen}
            onOpenChange={(open) => {
              setCreateOpen(open);
              if (open) setFeedback(null);
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus aria-hidden="true" />
                เพิ่มล็อกเกอร์
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>เพิ่มล็อกเกอร์</DialogTitle>
                <DialogDescription>
                  กำหนดรหัส โซน และราคาเช่ารายเดือนของตู้ใหม่
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={handleCreate}
                aria-busy={busy}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="locker-code">
                      รหัสล็อกเกอร์{" "}
                      <span aria-hidden="true" className="text-destructive">
                        *
                      </span>
                      <span className="sr-only">จำเป็น</span>
                    </Label>
                    <Input
                      id="locker-code"
                      value={createForm.code}
                      onChange={(event) =>
                        setCreateForm({
                          ...createForm,
                          code: event.target.value.toUpperCase(),
                        })
                      }
                      placeholder="เช่น A-001"
                      maxLength={20}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="locker-zone">
                      โซน{" "}
                      <span aria-hidden="true" className="text-destructive">
                        *
                      </span>
                      <span className="sr-only">จำเป็น</span>
                    </Label>
                    <Input
                      id="locker-zone"
                      value={createForm.zone}
                      onChange={(event) =>
                        setCreateForm({
                          ...createForm,
                          zone: event.target.value,
                        })
                      }
                      maxLength={50}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="locker-rate">ค่าเช่ารายเดือน</Label>
                  <Input
                    id="locker-rate"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={createForm.monthlyRate}
                    onChange={(event) =>
                      setCreateForm({
                        ...createForm,
                        monthlyRate: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="locker-note">หมายเหตุ</Label>
                  <Input
                    id="locker-note"
                    value={createForm.note}
                    onChange={(event) =>
                      setCreateForm({ ...createForm, note: event.target.value })
                    }
                    maxLength={500}
                  />
                </div>
                {feedback?.type === "error" ? (
                  <p className="text-sm text-destructive" role="alert">
                    {feedback.message}
                  </p>
                ) : null}
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? "กำลังบันทึก…" : "บันทึกล็อกเกอร์"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog
            open={rentOpen}
            onOpenChange={(open) => {
              setRentOpen(open);
              if (open) setFeedback(null);
            }}
          >
            <DialogTrigger asChild>
              <Button disabled={!availableLockers.length || !members.length}>
                <UserRound aria-hidden="true" />
                มอบล็อกเกอร์
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>มอบล็อกเกอร์ให้สมาชิก</DialogTitle>
                <DialogDescription>
                  เลือกสมาชิก ตู้ว่าง และรูปแบบการใช้งาน
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={handleRent}
                aria-busy={busy}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="rent-member">
                    สมาชิก{" "}
                    <span aria-hidden="true" className="text-destructive">
                      *
                    </span>
                    <span className="sr-only">จำเป็น</span>
                  </Label>
                  <Select
                    value={rentForm.memberId}
                    onValueChange={(value) =>
                      setRentForm({ ...rentForm, memberId: value })
                    }
                    required
                  >
                    <SelectTrigger id="rent-member" className="w-full">
                      <SelectValue placeholder="เลือกสมาชิก" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((member) => (
                        <SelectItem key={member.id} value={String(member.id)}>
                          {member.memberCode} — {member.firstName}{" "}
                          {member.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="rent-locker">
                      ล็อกเกอร์{" "}
                      <span aria-hidden="true" className="text-destructive">
                        *
                      </span>
                      <span className="sr-only">จำเป็น</span>
                    </Label>
                    <Select
                      value={rentForm.lockerId}
                      onValueChange={selectLocker}
                      required
                    >
                      <SelectTrigger id="rent-locker" className="w-full">
                        <SelectValue placeholder="เลือกตู้ว่าง" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableLockers.map((locker) => (
                          <SelectItem key={locker.id} value={String(locker.id)}>
                            {locker.code} · โซน {locker.zone}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rental-type">
                      รูปแบบ{" "}
                      <span aria-hidden="true" className="text-destructive">
                        *
                      </span>
                      <span className="sr-only">จำเป็น</span>
                    </Label>
                    <Select
                      value={rentForm.rentalType}
                      onValueChange={selectRentalType}
                    >
                      <SelectTrigger id="rental-type" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USAGE">ใช้งานชั่วคราว</SelectItem>
                        <SelectItem value="MONTHLY">เช่ารายเดือน</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="rental-start">วันเริ่มต้น</Label>
                    <Input
                      id="rental-start"
                      type="date"
                      value={rentForm.startDate}
                      onChange={(event) =>
                        setRentForm({
                          ...rentForm,
                          startDate: event.target.value,
                        })
                      }
                      required
                    />
                  </div>
                  {rentForm.rentalType === "MONTHLY" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="rental-end">วันสิ้นสุด</Label>
                      <Input
                        id="rental-end"
                        type="date"
                        min={rentForm.startDate}
                        value={rentForm.endDate}
                        onChange={(event) =>
                          setRentForm({
                            ...rentForm,
                            endDate: event.target.value,
                          })
                        }
                        required
                      />
                    </div>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rental-price">ค่าบริการ</Label>
                  <Input
                    id="rental-price"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={rentForm.price}
                    onChange={(event) =>
                      setRentForm({ ...rentForm, price: event.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rental-note">หมายเหตุ</Label>
                  <Input
                    id="rental-note"
                    value={rentForm.note}
                    onChange={(event) =>
                      setRentForm({ ...rentForm, note: event.target.value })
                    }
                    maxLength={500}
                  />
                </div>
                {feedback?.type === "error" ? (
                  <p className="text-sm text-destructive" role="alert">
                    {feedback.message}
                  </p>
                ) : null}
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? "กำลังมอบล็อกเกอร์…" : "ยืนยันการมอบล็อกเกอร์"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {feedback?.type === "success" ? (
          <p className="text-sm text-success" role="status">
            {feedback.message}
          </p>
        ) : null}
      </div>

      {lockers.length ? (
        <ul
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          aria-label="รายการล็อกเกอร์"
        >
          {lockers.map((locker) => {
            const overdue =
              locker.rentalType === "MONTHLY" &&
              locker.endDate &&
              locker.endDate < today;
            return (
              <li
                key={locker.id}
                className="rounded-xl border bg-card p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-bold tabular-nums">
                      {locker.code}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      โซน {locker.zone}
                    </p>
                  </div>
                  <Badge
                    variant={
                      locker.status === "AVAILABLE"
                        ? "outline"
                        : overdue
                          ? "destructive"
                          : "default"
                    }
                  >
                    {locker.status === "AVAILABLE"
                      ? "ว่าง"
                      : overdue
                        ? "หมดกำหนด"
                        : locker.rentalType === "MONTHLY"
                          ? "เช่ารายเดือน"
                          : "กำลังใช้งาน"}
                  </Badge>
                </div>
                {locker.status === "AVAILABLE" ? (
                  <div className="mt-5 border-t pt-4">
                    <p className="text-sm text-muted-foreground">
                      ค่าเช่ารายเดือน
                    </p>
                    <p className="mt-1 font-semibold tabular-nums">
                      {locker.monthlyRate === null
                        ? "ยังไม่กำหนด"
                        : money.format(locker.monthlyRate)}
                    </p>
                  </div>
                ) : (
                  <div className="mt-5 space-y-3 border-t pt-4">
                    <div>
                      <p className="text-sm font-medium">
                        {locker.memberCode} — {locker.firstName}{" "}
                        {locker.lastName}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        เริ่ม {formatDate(locker.startDate)}
                        {locker.endDate
                          ? ` · ถึง ${formatDate(locker.endDate)}`
                          : ""}
                      </p>
                    </div>
                    {confirmReleaseId === locker.id ? (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                        <p className="text-sm">
                          ยืนยันว่ารับคืนกุญแจ/สายรัดแล้ว?
                        </p>
                        <div className="mt-3 flex gap-2">
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={busy}
                            onClick={() => void handleRelease(locker.id)}
                          >
                            ยืนยันคืน
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => setConfirmReleaseId(null)}
                          >
                            ยกเลิก
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setConfirmReleaseId(locker.id)}
                      >
                        <RotateCcw aria-hidden="true" />
                        คืนล็อกเกอร์
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center">
          <LockKeyhole
            className="mx-auto size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="mt-3 font-medium">ยังไม่มีล็อกเกอร์ในระบบ</p>
          <p className="mt-1 text-pretty text-sm text-muted-foreground">
            กด “เพิ่มล็อกเกอร์” เพื่อสร้างตู้แรกและเริ่มมอบให้สมาชิก
          </p>
        </div>
      )}

      <section aria-labelledby="rental-history-heading">
        <div className="mb-3">
          <h2
            id="rental-history-heading"
            className="text-balance text-lg font-semibold"
          >
            ประวัติการใช้งานล่าสุด
          </h2>
          <p className="text-pretty text-sm text-muted-foreground">
            แสดงสูงสุด 30 รายการ เรียงจากรายการใหม่ที่สุด
          </p>
        </div>
        {history.length ? (
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ล็อกเกอร์</TableHead>
                  <TableHead>สมาชิก</TableHead>
                  <TableHead>รูปแบบ</TableHead>
                  <TableHead>เริ่มต้น</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="text-right">ค่าบริการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-semibold tabular-nums">
                      {item.lockerCode}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">
                        {item.firstName} {item.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {item.memberCode}
                      </p>
                    </TableCell>
                    <TableCell>
                      {item.rentalType === "MONTHLY" ? "รายเดือน" : "ชั่วคราว"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatDate(item.startDate)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          item.status === "ACTIVE"
                            ? "default"
                            : item.status === "COMPLETED"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {item.status === "ACTIVE"
                          ? "กำลังใช้"
                          : item.status === "COMPLETED"
                            ? "คืนแล้ว"
                            : "ยกเลิก"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {money.format(item.price)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center">
            <p className="font-medium">ยังไม่มีประวัติการใช้งาน</p>
            <p className="mt-1 text-sm text-muted-foreground">
              ประวัติจะปรากฏหลังมอบล็อกเกอร์ให้สมาชิก
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
