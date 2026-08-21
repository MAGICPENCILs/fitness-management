"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
import { createEquipmentSchema, updateEquipmentMasterSchema, type EquipmentCategory } from "@/lib/equipment-core";
import type { EquipmentDto } from "@/lib/equipment-service";
import { sendEquipmentMutation } from "@/components/equipment/equipment-client-response";
import { categoryLabels } from "@/components/equipment/equipment-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FieldErrors = Partial<Record<string, string>>;

/** แปลงค่าว่างเป็น undefined เฉพาะช่อง optional เพื่อให้ client ใช้กฎเดียวกับ schema ฝั่ง server */
function masterPayload(form: HTMLFormElement, item?: EquipmentDto) {
  const data = new FormData(form);
  const optional = (name: string) => String(data.get(name) ?? "").trim() || undefined;
  return {
    code: String(data.get("code") ?? ""),
    name: String(data.get("name") ?? ""),
    category: String(data.get("category") ?? "CARDIO") as EquipmentCategory,
    location: String(data.get("location") ?? ""),
    serialNumber: optional("serialNumber"),
    purchaseDate: optional("purchaseDate"),
    warrantyEndDate: optional("warrantyEndDate"),
    ...(item ? {} : { currentUsageHours: data.get("currentUsageHours") }),
    maintenanceIntervalHours: optional("maintenanceIntervalHours"),
    nextMaintenanceDate: optional("nextMaintenanceDate"),
    note: optional("note"),
    ...(item ? { expectedVersion: item.version } : {}),
  };
}

/** เก็บ error แรกของแต่ละ field เพื่อเชื่อมข้อความกับ control ที่แก้ไขได้โดยตรง */
function issueMap(issues: { path: PropertyKey[]; message: string }[]) {
  const result: FieldErrors = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

/** ใช้ฟอร์มเดียวกับ create/edit แต่ตัด field ปฏิบัติการออกจาก edit ตามขอบเขต API */
export function EquipmentFormDialog({ item, onSuccess }: { item?: EquipmentDto; onSuccess: (message: string) => void }) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const editing = Boolean(item);

  /** ไม่ยอมปิดระหว่างส่งคำขอ เพื่อไม่ให้ผู้ใช้เข้าใจว่าการบันทึกถูกยกเลิกแล้ว */
  function changeOpen(next: boolean) {
    if (!pending) {
      setOpen(next);
      if (!next) setErrors({});
    }
  }

  /** ตรวจ schema ก่อนส่ง และใช้ version จาก DTO ที่ผู้ใช้เปิด dialog เท่านั้น */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const payload = masterPayload(event.currentTarget, item);
    const parsed = (item ? updateEquipmentMasterSchema : createEquipmentSchema).safeParse(payload);
    if (!parsed.success) {
      setErrors(issueMap(parsed.error.issues));
      return;
    }
    setErrors({});
    setPending(true);
    const result = await sendEquipmentMutation({
      url: item ? `/api/equipment/${item.id}` : "/api/equipment",
      method: item ? "PUT" : "POST",
      body: parsed.data,
      flow: item ? "edit" : "create",
    });
    setPending(false);
    if (result.kind === "success") {
      setOpen(false);
      onSuccess(item ? "แก้ไขทะเบียนอุปกรณ์เรียบร้อยแล้ว" : "เพิ่มอุปกรณ์เรียบร้อยแล้ว");
      router.refresh();
    } else if (result.kind === "stale") {
      setOpen(false);
      onSuccess("ข้อมูลถูกแก้ไขแล้ว กรุณาตรวจสอบข้อมูลล่าสุด");
      router.refresh();
    } else if (result.kind === "error") {
      setErrors({ form: result.message });
    }
  }

  const field = (name: string, id: string) => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? id : undefined,
  });

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button ref={triggerRef} type="button" variant={editing ? "outline" : "default"} className="min-h-11">
          {editing ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {editing ? <span className="sr-only">แก้ไขทะเบียน {item?.code}</span> : "เพิ่มอุปกรณ์"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl [&_[data-slot=dialog-close]]:size-11" aria-busy={pending} onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }}>
        <DialogHeader>
          <DialogTitle>{editing ? `แก้ไขทะเบียน ${item?.code}` : "เพิ่มอุปกรณ์"}</DialogTitle>
          <DialogDescription>ข้อมูลทะเบียนและรอบบำรุงจะถูกตรวจสอบก่อนบันทึก</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div className="space-y-2"><Label htmlFor={`${editing ? "edit" : "create"}-code`}>รหัสอุปกรณ์</Label><Input id={`${editing ? "edit" : "create"}-code`} name="code" defaultValue={item?.code ?? ""} autoComplete="off" required disabled={pending} {...field("code", "equipment-code-error")} />{errors.code && <p id="equipment-code-error" className="text-sm text-destructive">{errors.code}</p>}</div>
          <div className="space-y-2"><Label htmlFor={`${editing ? "edit" : "create"}-name`}>ชื่ออุปกรณ์</Label><Input id={`${editing ? "edit" : "create"}-name`} name="name" defaultValue={item?.name ?? ""} autoComplete="off" required disabled={pending} {...field("name", "equipment-name-error")} />{errors.name && <p id="equipment-name-error" className="text-sm text-destructive">{errors.name}</p>}</div>
          <div className="space-y-2"><Label htmlFor={`${editing ? "edit" : "create"}-category`}>หมวดหมู่</Label><select id={`${editing ? "edit" : "create"}-category`} name="category" defaultValue={item?.category ?? "CARDIO"} disabled={pending} aria-invalid={errors.category ? true : undefined} aria-describedby={errors.category ? "equipment-category-error" : undefined} className="min-h-11 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{errors.category && <p id="equipment-category-error" className="text-sm text-destructive">{errors.category}</p>}</div>
          <div className="space-y-2"><Label htmlFor={`${editing ? "edit" : "create"}-location`}>ตำแหน่ง</Label><Input id={`${editing ? "edit" : "create"}-location`} name="location" defaultValue={item?.location ?? ""} autoComplete="off" required disabled={pending} {...field("location", "equipment-location-error")} />{errors.location && <p id="equipment-location-error" className="text-sm text-destructive">{errors.location}</p>}</div>
          <div className="space-y-2"><Label htmlFor={`${editing ? "edit" : "create"}-serial`}>Serial number</Label><Input id={`${editing ? "edit" : "create"}-serial`} name="serialNumber" defaultValue={item?.serialNumber ?? ""} autoComplete="off" disabled={pending} {...field("serialNumber", "equipment-serial-error")} />{errors.serialNumber && <p id="equipment-serial-error" className="text-sm text-destructive">{errors.serialNumber}</p>}</div>
          {!editing && <div className="space-y-2"><Label htmlFor="create-hours">ชั่วโมงใช้งานเริ่มต้น</Label><Input id="create-hours" name="currentUsageHours" type="number" inputMode="numeric" min={0} defaultValue="0" required disabled={pending} {...field("currentUsageHours", "equipment-hours-error")} />{errors.currentUsageHours && <p id="equipment-hours-error" className="text-sm text-destructive">{errors.currentUsageHours}</p>}</div>}
          <div className="space-y-2"><Label htmlFor={`${editing ? "edit" : "create"}-purchase`}>วันที่ซื้อ</Label><Input id={`${editing ? "edit" : "create"}-purchase`} name="purchaseDate" type="date" defaultValue={item?.purchaseDate ?? ""} disabled={pending} {...field("purchaseDate", "equipment-purchase-error")} />{errors.purchaseDate && <p id="equipment-purchase-error" className="text-sm text-destructive">{errors.purchaseDate}</p>}</div>
          <div className="space-y-2"><Label htmlFor={`${editing ? "edit" : "create"}-warranty`}>วันสิ้นสุดประกัน</Label><Input id={`${editing ? "edit" : "create"}-warranty`} name="warrantyEndDate" type="date" defaultValue={item?.warrantyEndDate ?? ""} disabled={pending} {...field("warrantyEndDate", "equipment-warranty-error")} />{errors.warrantyEndDate && <p id="equipment-warranty-error" className="text-sm text-destructive">{errors.warrantyEndDate}</p>}</div>
          <div className="space-y-2"><Label htmlFor={`${editing ? "edit" : "create"}-interval`}>รอบบำรุง (ชั่วโมง)</Label><Input id={`${editing ? "edit" : "create"}-interval`} name="maintenanceIntervalHours" type="number" inputMode="numeric" min={1} defaultValue={item?.maintenanceIntervalHours ?? ""} disabled={pending} {...field("maintenanceIntervalHours", "equipment-interval-error")} />{errors.maintenanceIntervalHours && <p id="equipment-interval-error" className="text-sm text-destructive">{errors.maintenanceIntervalHours}</p>}</div>
          <div className="space-y-2"><Label htmlFor={`${editing ? "edit" : "create"}-next-date`}>กำหนดบำรุงครั้งถัดไป</Label><Input id={`${editing ? "edit" : "create"}-next-date`} name="nextMaintenanceDate" type="date" defaultValue={item?.nextMaintenanceDate ?? ""} disabled={pending} {...field("nextMaintenanceDate", "equipment-next-date-error")} />{errors.nextMaintenanceDate && <p id="equipment-next-date-error" className="text-sm text-destructive">{errors.nextMaintenanceDate}</p>}</div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor={`${editing ? "edit" : "create"}-note`}>หมายเหตุ</Label><textarea id={`${editing ? "edit" : "create"}-note`} name="note" defaultValue={item?.note ?? ""} disabled={pending} aria-invalid={errors.note ? true : undefined} aria-describedby={errors.note ? "equipment-note-error" : undefined} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />{errors.note && <p id="equipment-note-error" className="text-sm text-destructive">{errors.note}</p>}</div>
          <p role="status" aria-live="polite" className="min-h-5 text-sm text-destructive sm:col-span-2">{errors.form ?? ""}</p>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => changeOpen(false)} disabled={pending}>ยกเลิก</Button>
            <Button type="submit" className="min-h-11" disabled={pending}>{pending && <Loader2 className="animate-spin" aria-hidden="true" />}{editing ? "บันทึกการแก้ไข" : "บันทึกอุปกรณ์"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
