"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wrench } from "lucide-react";
import { maintenanceSchema, type MaintenanceStatus } from "@/lib/equipment-core";
import type { EquipmentDto } from "@/lib/equipment-service";
import { sendEquipmentMutation } from "@/components/equipment/equipment-client-response";
import { maintenanceStatusLabels, maintenanceTypeLabels } from "@/components/equipment/equipment-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** บันทึกประวัติ append-only พร้อมผลต่อมิเตอร์และรอบถัดไปตามสถานะงาน */
export function EquipmentMaintenanceDialog({ item, today, onSuccess }: { item: EquipmentDto; today: string; onSuccess: (message: string) => void }) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<MaintenanceStatus>("COMPLETED");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  /** คง dialog ไว้ระหว่าง pending เพื่อให้สถานะการส่งคำขอชัดเจนและไม่ซ้ำ */
  function changeOpen(next: boolean) {
    if (!pending) {
      setOpen(next);
      if (!next) setErrors({});
    }
  }

  /** ส่งวันเสร็จเฉพาะงาน COMPLETED และใช้ meter/version ของ DTO ที่เลือกเพื่อป้องกันการเขียนทับ */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const optional = (name: string) => String(data.get(name) ?? "").trim() || undefined;
    const parsed = maintenanceSchema.safeParse({
      type: data.get("type"), status, scheduledDate: data.get("scheduledDate"),
      completedDate: status === "COMPLETED" ? data.get("completedDate") : undefined,
      usageHoursAtService: data.get("usageHoursAtService"), cost: data.get("cost"),
      technician: optional("technician"), nextMaintenanceDate: optional("nextMaintenanceDate"),
      note: optional("note"), expectedVersion: item.version,
    });
    if (!parsed.success) {
      const nextErrors: Partial<Record<string, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      setErrors(nextErrors);
      return;
    }
    if ((parsed.data.usageHoursAtService ?? item.currentUsageHours) < item.currentUsageHours) {
      setErrors({ usageHoursAtService: "ชั่วโมง ณ วันที่บำรุงต้องไม่น้อยกว่ามิเตอร์ปัจจุบัน" });
      return;
    }
    setErrors({});
    setPending(true);
    const result = await sendEquipmentMutation({ url: `/api/equipment/${item.id}/maintenance`, method: "POST", body: parsed.data, flow: "maintenance" });
    setPending(false);
    if (result.kind === "success") {
      setOpen(false);
      onSuccess("บันทึกงานบำรุงเรียบร้อยแล้ว");
      router.refresh();
    } else if (result.kind === "stale") {
      setOpen(false);
      onSuccess("ข้อมูลถูกแก้ไขแล้ว กรุณาตรวจสอบข้อมูลล่าสุด");
      router.refresh();
    } else if (result.kind === "error") setErrors({ form: result.message });
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild><Button ref={triggerRef} type="button" variant="outline" className="min-h-11"><Wrench aria-hidden="true" /><span className="sr-only">บันทึกงานบำรุง {item.code}</span></Button></DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl [&_[data-slot=dialog-close]]:size-11" aria-busy={pending} onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }}>
        <DialogHeader><DialogTitle>บันทึกงานบำรุงรักษา</DialogTitle><DialogDescription>{item.code} · {item.name} — การบันทึกงานที่เสร็จแล้วจะอัปเดตมิเตอร์และรอบบำรุงถัดไป</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div className="space-y-2"><Label htmlFor={`maintenance-type-${item.id}`}>ประเภทงาน</Label><select id={`maintenance-type-${item.id}`} name="type" defaultValue="PREVENTIVE" disabled={pending} aria-invalid={errors.type ? true : undefined} aria-describedby={errors.type ? `maintenance-type-error-${item.id}` : undefined} className="min-h-11 w-full rounded-md border bg-background px-3 text-sm">{Object.entries(maintenanceTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{errors.type && <p id={`maintenance-type-error-${item.id}`} className="text-sm text-destructive">{errors.type}</p>}</div>
          <div className="space-y-2"><Label htmlFor={`maintenance-status-${item.id}`}>สถานะงาน</Label><select id={`maintenance-status-${item.id}`} name="status" value={status} onChange={(event) => setStatus(event.target.value as MaintenanceStatus)} disabled={pending} aria-invalid={errors.status ? true : undefined} aria-describedby={errors.status ? `maintenance-status-error-${item.id}` : undefined} className="min-h-11 w-full rounded-md border bg-background px-3 text-sm">{Object.entries(maintenanceStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{errors.status && <p id={`maintenance-status-error-${item.id}`} className="text-sm text-destructive">{errors.status}</p>}</div>
          <div className="space-y-2"><Label htmlFor={`maintenance-scheduled-${item.id}`}>วันที่นัดหมาย</Label><Input id={`maintenance-scheduled-${item.id}`} name="scheduledDate" type="date" defaultValue={today} required disabled={pending} aria-invalid={errors.scheduledDate ? true : undefined} aria-describedby={errors.scheduledDate ? `maintenance-scheduled-error-${item.id}` : undefined} />{errors.scheduledDate && <p id={`maintenance-scheduled-error-${item.id}`} className="text-sm text-destructive">{errors.scheduledDate}</p>}</div>
          {status === "COMPLETED" && <div className="space-y-2"><Label htmlFor={`maintenance-completed-${item.id}`}>วันที่เสร็จงาน</Label><Input id={`maintenance-completed-${item.id}`} name="completedDate" type="date" defaultValue={today} required disabled={pending} aria-invalid={errors.completedDate ? true : undefined} aria-describedby={errors.completedDate ? `maintenance-completed-error-${item.id}` : undefined} />{errors.completedDate && <p id={`maintenance-completed-error-${item.id}`} className="text-sm text-destructive">{errors.completedDate}</p>}</div>}
          <div className="space-y-2"><Label htmlFor={`maintenance-hours-${item.id}`}>ชั่วโมง ณ วันที่บำรุง</Label><Input id={`maintenance-hours-${item.id}`} name="usageHoursAtService" type="number" inputMode="numeric" min={item.currentUsageHours} defaultValue={item.currentUsageHours} disabled={pending} aria-invalid={errors.usageHoursAtService ? true : undefined} aria-describedby={errors.usageHoursAtService ? `maintenance-hours-error-${item.id}` : undefined} />{errors.usageHoursAtService && <p id={`maintenance-hours-error-${item.id}`} className="text-sm text-destructive">{errors.usageHoursAtService}</p>}</div>
          <div className="space-y-2"><Label htmlFor={`maintenance-cost-${item.id}`}>ค่าใช้จ่าย (บาท)</Label><Input id={`maintenance-cost-${item.id}`} name="cost" type="number" inputMode="decimal" min={0} step="0.01" defaultValue="0" required disabled={pending} aria-invalid={errors.cost ? true : undefined} aria-describedby={errors.cost ? `maintenance-cost-error-${item.id}` : undefined} />{errors.cost && <p id={`maintenance-cost-error-${item.id}`} className="text-sm text-destructive">{errors.cost}</p>}</div>
          <div className="space-y-2"><Label htmlFor={`maintenance-technician-${item.id}`}>ช่าง / ผู้รับผิดชอบ</Label><Input id={`maintenance-technician-${item.id}`} name="technician" autoComplete="name" disabled={pending} aria-invalid={errors.technician ? true : undefined} aria-describedby={errors.technician ? `maintenance-technician-error-${item.id}` : undefined} />{errors.technician && <p id={`maintenance-technician-error-${item.id}`} className="text-sm text-destructive">{errors.technician}</p>}</div>
          <div className="space-y-2"><Label htmlFor={`maintenance-next-${item.id}`}>กำหนดบำรุงครั้งถัดไป</Label><Input id={`maintenance-next-${item.id}`} name="nextMaintenanceDate" type="date" disabled={pending} aria-invalid={errors.nextMaintenanceDate ? true : undefined} aria-describedby={errors.nextMaintenanceDate ? `maintenance-next-error-${item.id}` : undefined} />{errors.nextMaintenanceDate && <p id={`maintenance-next-error-${item.id}`} className="text-sm text-destructive">{errors.nextMaintenanceDate}</p>}</div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor={`maintenance-note-${item.id}`}>รายละเอียดงาน</Label><textarea id={`maintenance-note-${item.id}`} name="note" disabled={pending} aria-invalid={errors.note ? true : undefined} aria-describedby={errors.note ? `maintenance-note-error-${item.id}` : undefined} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" />{errors.note && <p id={`maintenance-note-error-${item.id}`} className="text-sm text-destructive">{errors.note}</p>}</div>
          <p role="status" aria-live="polite" className="min-h-5 text-sm text-destructive sm:col-span-2">{errors.form ?? ""}</p>
          <DialogFooter className="sm:col-span-2"><Button type="button" variant="outline" className="min-h-11" onClick={() => changeOpen(false)} disabled={pending}>ยกเลิก</Button><Button type="submit" className="min-h-11" disabled={pending}>{pending && <Loader2 className="animate-spin" aria-hidden="true" />}บันทึกงานบำรุง</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
