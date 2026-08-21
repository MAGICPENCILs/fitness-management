"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Gauge, Loader2 } from "lucide-react";
import { updateEquipmentOperationSchema, type MutableEquipmentStatus } from "@/lib/equipment-core";
import type { EquipmentDto } from "@/lib/equipment-service";
import { sendEquipmentMutation } from "@/components/equipment/equipment-client-response";
import { equipmentStatusLabels } from "@/components/equipment/equipment-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const mutableStatuses: MutableEquipmentStatus[] = ["OPERATIONAL", "MAINTENANCE", "OUT_OF_SERVICE"];

/** แยกการเปลี่ยนมิเตอร์/สถานะออกจากทะเบียนและไม่เสนอ RETIRED เป็นตัวเลือก */
export function EquipmentOperationDialog({ item, onSuccess }: { item: EquipmentDto; onSuccess: (message: string) => void }) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ field?: "currentUsageHours" | "status"; message: string }>({ message: "" });

  /** ป้องกันการ dismiss ระหว่าง request เพื่อไม่เปิดทางส่งซ้ำจาก trigger เดิม */
  function changeOpen(next: boolean) {
    if (!pending) {
      setOpen(next);
      if (!next) setError({ message: "" });
    }
  }

  /** จำกัดค่าปฏิบัติการไว้สามสถานะ และผูก version จากรายการที่ผู้ใช้เปิดมาโดยไม่ fallback */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const parsed = updateEquipmentOperationSchema.safeParse({
      currentUsageHours: data.get("currentUsageHours"),
      status: data.get("status"),
      expectedVersion: item.version,
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setError({ field: first?.path[0] === "status" ? "status" : "currentUsageHours", message: first?.message ?? "ข้อมูลสถานะไม่ถูกต้อง" });
      return;
    }
    if (parsed.data.currentUsageHours < item.currentUsageHours) {
      setError({ field: "currentUsageHours", message: "ชั่วโมงใช้งานต้องไม่น้อยกว่าค่าปัจจุบัน" });
      return;
    }
    setError({ message: "" });
    setPending(true);
    const result = await sendEquipmentMutation({ url: `/api/equipment/${item.id}`, method: "PATCH", body: parsed.data, flow: "operation" });
    setPending(false);
    if (result.kind === "success") {
      setOpen(false);
      onSuccess("อัปเดตมิเตอร์และสถานะเรียบร้อยแล้ว");
      router.refresh();
    } else if (result.kind === "stale") {
      setOpen(false);
      onSuccess("ข้อมูลถูกแก้ไขแล้ว กรุณาตรวจสอบข้อมูลล่าสุด");
      router.refresh();
    } else if (result.kind === "error") setError({ message: result.message });
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild><Button ref={triggerRef} type="button" variant="outline" className="min-h-11"><Gauge aria-hidden="true" /><span className="sr-only">อัปเดตมิเตอร์และสถานะ {item.code}</span></Button></DialogTrigger>
      <DialogContent className="sm:max-w-lg [&_[data-slot=dialog-close]]:size-11" aria-busy={pending} onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }}>
        <DialogHeader><DialogTitle>อัปเดตมิเตอร์และสถานะ</DialogTitle><DialogDescription>{item.code} · {item.name} — ชั่วโมงปัจจุบัน {item.currentUsageHours.toLocaleString("th-TH")}</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2"><Label htmlFor={`operation-hours-${item.id}`}>ชั่วโมงใช้งาน</Label><Input id={`operation-hours-${item.id}`} name="currentUsageHours" type="number" inputMode="numeric" min={item.currentUsageHours} defaultValue={item.currentUsageHours} required disabled={pending} aria-invalid={error.field === "currentUsageHours" ? true : undefined} aria-describedby={error.field === "currentUsageHours" ? `operation-error-${item.id}` : undefined} /></div>
          <div className="space-y-2"><Label htmlFor={`operation-status-${item.id}`}>สถานะการใช้งาน</Label><select id={`operation-status-${item.id}`} name="status" defaultValue={item.status} disabled={pending} aria-invalid={error.field === "status" ? true : undefined} aria-describedby={error.field === "status" ? `operation-error-${item.id}` : undefined} className="min-h-11 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{mutableStatuses.map((status) => <option key={status} value={status}>{equipmentStatusLabels[status]}</option>)}</select></div>
          <p id={`operation-error-${item.id}`} role="status" aria-live="polite" className="min-h-5 text-sm text-destructive">{error.message}</p>
          <DialogFooter><Button type="button" variant="outline" className="min-h-11" onClick={() => changeOpen(false)} disabled={pending}>ยกเลิก</Button><Button type="submit" className="min-h-11" disabled={pending}>{pending && <Loader2 className="animate-spin" aria-hidden="true" />}บันทึกสถานะ</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
