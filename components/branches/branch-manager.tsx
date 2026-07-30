"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, MapPin, Network, Plus } from "lucide-react";
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
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type BranchRow = {
  id: number;
  code: string;
  name: string;
  phone: string | null;
  address: string | null;
  status: "ACTIVE" | "INACTIVE";
  isMain: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

/** แสดงและเพิ่มสาขาโดยคงการตั้งค่าสาขาหลักไว้เป็นข้อมูลอ่านอย่างเดียวใน MVP */
export function BranchManager({ branches }: { branches: BranchRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  /** เปิดฟอร์มสาขาใหม่พร้อมล้างข้อผิดพลาดจากครั้งก่อน */
  function openCreateDialog() {
    setError("");
    setOpen(true);
  }

  /** ตรวจฟอร์มฝั่ง browser และส่งข้อมูลให้ API ตรวจซ้ำก่อนบันทึก */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: data.get("code"),
          name: data.get("name"),
          phone: data.get("phone"),
          address: data.get("address"),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "เพิ่มสาขาไม่สำเร็จ");
      setOpen(false);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "เพิ่มสาขาไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }

  const activeCount = branches.filter((branch) => branch.status === "ACTIVE").length;
  const mainBranch = branches.find((branch) => branch.isMain);

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="สรุปสาขา" className="grid gap-4 sm:grid-cols-3">
        <StatCard label="สาขาทั้งหมด" value={branches.length.toLocaleString("th-TH")} icon={Network} tone="primary" />
        <StatCard label="สาขาที่เปิดใช้งาน" value={activeCount.toLocaleString("th-TH")} icon={CheckCircle2} tone="success" />
        <StatCard label="สาขาหลัก" value={mainBranch?.code ?? "-"} icon={Building2} tone="info" />
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">รายชื่อสาขา</h2>
            <p className="text-sm text-muted-foreground">สาขาหลักรองรับข้อมูลเดิม ส่วนสาขาใหม่จะปรากฏในตัวเลือกสาขาทันที</p>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            เพิ่มสาขา
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>รหัส</TableHead><TableHead>ชื่อสาขา</TableHead><TableHead>ที่อยู่</TableHead><TableHead>โทรศัพท์</TableHead><TableHead>สถานะ</TableHead></TableRow></TableHeader>
            <TableBody>
              {branches.map((branch) => (
                <TableRow key={branch.id}>
                  <TableCell className="font-semibold tabular-nums">{branch.code}</TableCell>
                  <TableCell><div className="flex items-center gap-2"><span>{branch.name}</span>{branch.isMain && <Badge>สาขาหลัก</Badge>}</div></TableCell>
                  <TableCell className="max-w-80"><span className="text-pretty">{branch.address || "ยังไม่ระบุ"}</span></TableCell>
                  <TableCell className="tabular-nums">{branch.phone || "-"}</TableCell>
                  <TableCell><Badge variant={branch.status === "ACTIVE" ? "secondary" : "outline"}>{branch.status === "ACTIVE" ? "เปิดใช้งาน" : "ปิดใช้งาน"}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <DialogHeader><DialogTitle>เพิ่มสาขา</DialogTitle><DialogDescription>สาขาใหม่จะเปิดใช้งานทันทีและเลือกจาก sidebar ได้ทุกหน้า</DialogDescription></DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2"><Label htmlFor="branch-code">รหัสสาขา *</Label><Input id="branch-code" name="code" required minLength={2} maxLength={20} placeholder="เช่น BKK02" /></div>
              <div className="flex flex-col gap-2"><Label htmlFor="branch-name">ชื่อสาขา *</Label><Input id="branch-name" name="name" required minLength={2} maxLength={150} placeholder="เช่น Fitness Pro รัชดา" /></div>
            </div>
            <div className="flex flex-col gap-2"><Label htmlFor="branch-phone">โทรศัพท์</Label><Input id="branch-phone" name="phone" type="tel" maxLength={20} /></div>
            <div className="flex flex-col gap-2"><Label htmlFor="branch-address">ที่อยู่</Label><Input id="branch-address" name="address" maxLength={1000} placeholder="ที่อยู่สำหรับเอกสารและการติดต่อ" /></div>
            {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={pending}><MapPin data-icon="inline-start" aria-hidden="true" />{pending ? "กำลังเพิ่ม..." : "เพิ่มสาขา"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
