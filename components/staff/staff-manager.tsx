"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, ShieldCheck, UserCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
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

type StaffRole = "OWNER" | "MANAGER" | "COUNTER" | "TRAINER";
type StaffRow = {
  id: number;
  staffCode: string;
  firstName: string;
  lastName: string;
  homeBranchId: number;
  branchName: string;
  role: StaffRole;
  phone: string | null;
  email: string | null;
  status: "ACTIVE" | "INACTIVE";
};

const roleLabels: Record<StaffRole, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  COUNTER: "Counter",
  TRAINER: "Trainer",
};

const emptyForm = {
  staffCode: "",
  firstName: "",
  lastName: "",
  homeBranchId: "",
  role: "COUNTER" as StaffRole,
  phone: "",
  email: "",
  status: "ACTIVE" as "ACTIVE" | "INACTIVE",
};

/** แสดงและจัดการบัญชีพนักงานตามขอบเขตสาขาและบทบาทของ actor ปัจจุบัน */
export function StaffManager({
  staff,
  branches,
  actor,
}: {
  staff: StaffRow[];
  branches: Array<{ id: number; name: string }>;
  actor: { role: "OWNER" | "MANAGER"; homeBranchId: number };
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [branchFilter, setBranchFilter] = useState("ALL");
  const [form, setForm] = useState(emptyForm);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const filteredStaff = useMemo(
    () =>
      staff.filter(
        (row) =>
          (roleFilter === "ALL" || row.role === roleFilter) &&
          (statusFilter === "ALL" || row.status === statusFilter) &&
          (branchFilter === "ALL" ||
            row.homeBranchId === Number(branchFilter)),
      ),
    [branchFilter, roleFilter, staff, statusFilter],
  );

  /** เปิดฟอร์มใหม่โดยล็อกสาขาของ Manager ไว้ที่สาขาหลัก */
  function openCreateDialog() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      homeBranchId: String(
        actor.role === "MANAGER" ? actor.homeBranchId : branches[0]?.id ?? "",
      ),
    });
    setFeedback(null);
    setDialogOpen(true);
  }

  /** เปิดฟอร์มแก้ไขด้วยค่าปัจจุบันของพนักงานที่เลือก */
  function openEditDialog(row: StaffRow) {
    setEditingId(row.id);
    setForm({
      staffCode: row.staffCode,
      firstName: row.firstName,
      lastName: row.lastName,
      homeBranchId: String(row.homeBranchId),
      role: row.role,
      phone: row.phone ?? "",
      email: row.email ?? "",
      status: row.status,
    });
    setFeedback(null);
    setDialogOpen(true);
  }

  /** บันทึกผ่าน API แล้ว refresh server data เฉพาเมื่อสำเร็จ */
  async function submitStaff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch(
        editingId ? `/api/staff/${editingId}` : "/api/staff",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            homeBranchId: Number(form.homeBranchId),
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "บันทึกบัญชีไม่สำเร็จ");
      setDialogOpen(false);
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "บันทึกบัญชีไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }

  const activeCount = staff.filter((row) => row.status === "ACTIVE").length;
  const managerCount = staff.filter((row) =>
    ["OWNER", "MANAGER"].includes(row.role),
  ).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="พนักงานทั้งหมด" value={staff.length} icon={Users} />
        <StatCard label="กำลังใช้งาน" value={activeCount} icon={UserCheck} tone="success" />
        <StatCard label="ผู้ดูแล" value={managerCount} icon={ShieldCheck} tone="info" />
      </div>

      <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="staff-list-heading">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 id="staff-list-heading" className="text-lg font-semibold">บัญชีพนักงาน</h2>
            <p className="text-sm text-muted-foreground">กรองตามบทบาท สถานะ และสาขา</p>
          </div>
          <Button onClick={openCreateDialog}><Plus aria-hidden="true" />เพิ่มพนักงาน</Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full" aria-label="กรองบทบาท"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="ALL">ทุกบทบาท</SelectItem>{Object.entries(roleLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full" aria-label="กรองสถานะ"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="ALL">ทุกสถานะ</SelectItem><SelectItem value="ACTIVE">ใช้งาน</SelectItem><SelectItem value="INACTIVE">ปิดใช้งาน</SelectItem></SelectContent>
          </Select>
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-full" aria-label="กรองสาขา"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="ALL">ทุกสาขา</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="mt-4 overflow-hidden rounded-lg border">
          <Table>
            <TableHeader><TableRow><TableHead>พนักงาน</TableHead><TableHead>บทบาท</TableHead><TableHead>สาขา</TableHead><TableHead>สถานะ</TableHead><TableHead className="text-right">จัดการ</TableHead></TableRow></TableHeader>
            <TableBody>
              {filteredStaff.length ? filteredStaff.map((row) => (
                <TableRow key={row.id}>
                  <TableCell><div className="font-medium">{row.firstName} {row.lastName}</div><div className="text-xs text-muted-foreground">{row.staffCode}</div></TableCell>
                  <TableCell>{roleLabels[row.role]}</TableCell><TableCell>{row.branchName}</TableCell>
                  <TableCell><Badge variant={row.status === "ACTIVE" ? "default" : "outline"}>{row.status === "ACTIVE" ? "ใช้งาน" : "ปิดใช้งาน"}</Badge></TableCell>
                  <TableCell className="text-right"><Button variant="ghost" onClick={() => openEditDialog(row)} aria-label={`แก้ไข ${row.firstName} ${row.lastName}`}><Pencil aria-hidden="true" />แก้ไข</Button></TableCell>
                </TableRow>
              )) : <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">ไม่พบบัญชีตามตัวกรอง</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{editingId ? "แก้ไขพนักงาน" : "เพิ่มพนักงาน"}</DialogTitle><DialogDescription>กำหนดข้อมูล สาขา และบทบาทที่บัญชีนี้ใช้งานได้</DialogDescription></DialogHeader>
          <form onSubmit={submitStaff} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="staff-code">รหัสพนักงาน</Label><Input id="staff-code" required value={form.staffCode} onChange={(event) => setForm({ ...form, staffCode: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="staff-first-name">ชื่อ</Label><Input id="staff-first-name" required value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="staff-last-name">นามสกุล</Label><Input id="staff-last-name" required value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="staff-email">อีเมล</Label><Input id="staff-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="staff-phone">เบอร์โทร</Label><Input id="staff-phone" type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></div>
              <div className="space-y-2"><Label>บทบาท</Label><Select value={form.role} onValueChange={(role: StaffRole) => setForm({ ...form, role })}><SelectTrigger className="w-full" aria-label="บทบาท"><SelectValue /></SelectTrigger><SelectContent>{(Object.entries(roleLabels) as Array<[StaffRole, string]>).filter(([role]) => actor.role === "OWNER" || role !== "OWNER").map(([role, label]) => <SelectItem key={role} value={role}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>สาขา</Label><Select disabled={actor.role === "MANAGER"} value={form.homeBranchId} onValueChange={(homeBranchId) => setForm({ ...form, homeBranchId })}><SelectTrigger className="w-full" aria-label="สาขา"><SelectValue placeholder="เลือกสาขา" /></SelectTrigger><SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>สถานะ</Label><Select value={form.status} onValueChange={(status: "ACTIVE" | "INACTIVE") => setForm({ ...form, status })}><SelectTrigger className="w-full" aria-label="สถานะ"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ACTIVE">ใช้งาน</SelectItem><SelectItem value="INACTIVE">ปิดใช้งาน</SelectItem></SelectContent></Select></div>
            </div>
            {feedback && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{feedback}</p>}
            <DialogFooter className="mx-0 mb-0 px-0 pb-0"><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>ยกเลิก</Button><Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" aria-hidden="true" />}{pending ? "กำลังบันทึก" : "บันทึกบัญชี"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
