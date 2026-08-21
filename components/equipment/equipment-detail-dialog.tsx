"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, ChevronLeft, ChevronRight, Eye, Loader2 } from "lucide-react";
import type { EquipmentDetailDto, EquipmentDto, MaintenanceDto } from "@/lib/equipment-service";
import { categoryLabels, equipmentStatusLabels, maintenanceStateLabels, maintenanceStatusLabels, maintenanceTypeLabels } from "@/components/equipment/equipment-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** แยก object JSON ออกจาก null/array ก่อนอ่าน field ทุกครั้ง */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const categories = new Set(["CARDIO", "STRENGTH", "FREE_WEIGHT", "ACCESSORY", "OTHER"]);
const statuses = new Set(["OPERATIONAL", "MAINTENANCE", "OUT_OF_SERVICE", "RETIRED"]);
const maintenanceStates = new Set(["OVERDUE", "DUE_SOON", "SCHEDULED", "NONE"]);
const maintenanceTypes = new Set(["INSPECTION", "PREVENTIVE", "REPAIR"]);
const maintenanceStatuses = new Set(["SCHEDULED", "IN_PROGRESS", "COMPLETED"]);

/** ตรวจ field ข้อความที่ route อนุญาตให้ไม่มีค่าได้ */
function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/** รับเฉพาะตัวเลข finite เพื่อไม่ให้ NaN/Infinity หลุดเข้า formatter */
function nullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

/** สร้าง equipment DTO จาก allowlist ของชนิดข้อมูล เพื่อไม่ให้ partial JSON ไปทำให้ render crash */
function safeEquipmentDto(value: unknown): EquipmentDto | null {
  if (!isRecord(value)) return null;
  const stringKeys = ["code", "name", "location"] as const;
  const nullableStringKeys = ["serialNumber", "retiredAt", "retiredReason", "purchaseDate", "warrantyEndDate", "nextMaintenanceDate", "lastMaintenanceDate", "note", "createdAt", "updatedAt"] as const;
  const nullableNumberKeys = ["maintenanceIntervalHours", "nextMaintenanceHours", "remainingHours", "remainingDays"] as const;
  if (!Number.isSafeInteger(value.id) || !Number.isSafeInteger(value.version) || typeof value.currentUsageHours !== "number" || !Number.isFinite(value.currentUsageHours)) return null;
  if (stringKeys.some((key) => typeof value[key] !== "string") || nullableStringKeys.some((key) => !nullableString(value[key])) || nullableNumberKeys.some((key) => !nullableNumber(value[key]))) return null;
  if (typeof value.category !== "string" || !categories.has(value.category) || typeof value.status !== "string" || !statuses.has(value.status) || typeof value.maintenanceState !== "string" || !maintenanceStates.has(value.maintenanceState)) return null;
  return {
    id: value.id as number, code: value.code as string, name: value.name as string,
    category: value.category as EquipmentDto["category"], location: value.location as string,
    serialNumber: value.serialNumber as string | null, status: value.status as EquipmentDto["status"],
    retiredAt: value.retiredAt as string | null, retiredReason: value.retiredReason as string | null,
    version: value.version as number, purchaseDate: value.purchaseDate as string | null,
    warrantyEndDate: value.warrantyEndDate as string | null, currentUsageHours: value.currentUsageHours,
    maintenanceIntervalHours: value.maintenanceIntervalHours as number | null,
    nextMaintenanceHours: value.nextMaintenanceHours as number | null,
    nextMaintenanceDate: value.nextMaintenanceDate as string | null,
    lastMaintenanceDate: value.lastMaintenanceDate as string | null, note: value.note as string | null,
    maintenanceState: value.maintenanceState as EquipmentDto["maintenanceState"],
    remainingHours: value.remainingHours as number | null, remainingDays: value.remainingDays as number | null,
    createdAt: value.createdAt as string | null, updatedAt: value.updatedAt as string | null,
  };
}

/** ยอมรับ detail เฉพาะ DTO ที่มี identity/version ตรง contract แล้วสร้าง object ใหม่เพื่อทิ้ง field แปลกปลอม */
/** อ่าน detail/history/pagination แบบ fail-closed และตัด note ของประวัติที่หน้า detail ไม่ต้องแสดง */
function readDetailDto(value: unknown): EquipmentDetailDto | null {
  if (!isRecord(value) || !isRecord(value.equipment) || !Array.isArray(value.history) || !isRecord(value.historyPagination)) return null;
  const safeEquipment = safeEquipmentDto(value.equipment);
  if (!safeEquipment) return null;
  const history = value.history.flatMap((entry): MaintenanceDto[] => {
    if (!isRecord(entry) || !Number.isSafeInteger(entry.id) || typeof entry.type !== "string" || !maintenanceTypes.has(entry.type) || typeof entry.status !== "string" || !maintenanceStatuses.has(entry.status) || typeof entry.scheduledDate !== "string") return [];
    return [{
      id: entry.id as number,
      equipmentId: typeof entry.equipmentId === "number" ? entry.equipmentId : safeEquipment.id,
      equipmentCode: typeof entry.equipmentCode === "string" ? entry.equipmentCode : safeEquipment.code,
      equipmentName: typeof entry.equipmentName === "string" ? entry.equipmentName : safeEquipment.name,
      type: entry.type as MaintenanceDto["type"], status: entry.status as MaintenanceDto["status"], scheduledDate: entry.scheduledDate,
      completedDate: typeof entry.completedDate === "string" ? entry.completedDate : null,
      usageHoursAtService: typeof entry.usageHoursAtService === "number" ? entry.usageHoursAtService : null,
      cost: typeof entry.cost === "number" ? entry.cost : 0,
      technician: typeof entry.technician === "string" ? entry.technician : null,
      note: null,
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : null,
    }];
  });
  const pagination = value.historyPagination;
  if (![pagination.page, pagination.pageSize, pagination.total, pagination.totalPages].every((part) => typeof part === "number")) return null;
  return { equipment: safeEquipment, history, historyPagination: pagination as EquipmentDetailDto["historyPagination"] };
}

/** แสดง calendar date ตรงตาม DTO โดยไม่แปลง timezone ซ้ำ */
function displayDate(value: string | null) {
  return value || "—";
}

/** โหลด authoritative detail เฉพาะตอนเปิด และแยก pending/error/content เป็น region คงที่ */
export function EquipmentDetailDialog({ item }: { item: EquipmentDto }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<EquipmentDetailDto | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  /** โหลดข้อมูลเมื่อ dialog เปิดหรือเปลี่ยนหน้าประวัติ และยกเลิก state update ของ request เก่าหลังปิด */
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetch(`/api/equipment/${item.id}?historyPage=${page}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) { globalThis.location.replace("/login"); return null; }
        if (response.status === 403) { globalThis.location.replace("/forbidden"); return null; }
        if (!response.ok || !(response.headers.get("content-type") ?? "").includes("application/json")) return null;
        try { return readDetailDto(await response.json()); } catch { return null; }
      })
      .then((value) => {
        if (controller.signal.aborted) return;
        if (!value) setError("ไม่สามารถโหลดรายละเอียดอุปกรณ์ได้ชั่วคราว กรุณาลองใหม่");
        else setDetail(value);
      })
      .catch(() => { if (!controller.signal.aborted) setError("ไม่สามารถโหลดรายละเอียดอุปกรณ์ได้ชั่วคราว กรุณาลองใหม่"); })
      .finally(() => { if (!controller.signal.aborted) setPending(false); });
    return () => controller.abort();
  }, [item.id, open, page]);

  /** รีเซ็ตหน้าประวัติทุกครั้งที่เปิดใหม่เพื่อไม่คง detail เก่าข้ามรอบ */
  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) { setPage(1); setDetail(null); setError(""); setPending(true); }
  }

  /** ตั้ง loading ก่อนเปลี่ยนหน้าเพื่อให้ effect ทำหน้าที่เฉพาะ sync กับ fetch ภายนอก */
  function changePage(nextPage: number) {
    setPending(true);
    setError("");
    setPage(nextPage);
  }

  const equipment = detail?.equipment;
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild><Button ref={triggerRef} type="button" variant="outline" className="min-h-11"><Eye aria-hidden="true" /><span className="sr-only">ดูรายละเอียด {item.code}</span></Button></DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl [&_[data-slot=dialog-close]]:size-11" aria-busy={pending} onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }}>
        <DialogHeader><DialogTitle>รายละเอียด {item.code}</DialogTitle><DialogDescription>ข้อมูลทะเบียน สถานะ และประวัติการบำรุงที่อนุญาตในสาขาปัจจุบัน</DialogDescription></DialogHeader>
        <div role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{pending ? <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden="true" />กำลังโหลดรายละเอียด</span> : error}</div>
        {equipment && !pending && !error ? <div className="space-y-5">
          <div className="flex flex-wrap gap-2"><Badge variant="outline">{equipmentStatusLabels[equipment.status]}</Badge><Badge variant="outline">{equipment.status === "RETIRED" ? <><Archive aria-hidden="true" /> สิ้นสุดการใช้งาน</> : maintenanceStateLabels[equipment.maintenanceState]}</Badge></div>
          <dl className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="text-muted-foreground">ชื่อ</dt><dd className="font-medium">{equipment.name}</dd></div><div><dt className="text-muted-foreground">หมวดหมู่</dt><dd>{categoryLabels[equipment.category]}</dd></div><div><dt className="text-muted-foreground">ตำแหน่ง</dt><dd>{equipment.location}</dd></div>
            <div><dt className="text-muted-foreground">Serial number</dt><dd>{equipment.serialNumber ?? "—"}</dd></div><div><dt className="text-muted-foreground">วันที่ซื้อ / ประกัน</dt><dd>{displayDate(equipment.purchaseDate)} / {displayDate(equipment.warrantyEndDate)}</dd></div><div><dt className="text-muted-foreground">ชั่วโมงใช้งาน</dt><dd>{equipment.currentUsageHours.toLocaleString("th-TH")} ชม.</dd></div>
            <div><dt className="text-muted-foreground">รอบชั่วโมงถัดไป</dt><dd>{equipment.nextMaintenanceHours?.toLocaleString("th-TH") ?? "—"}</dd></div><div><dt className="text-muted-foreground">วันบำรุงถัดไป</dt><dd>{displayDate(equipment.nextMaintenanceDate)}</dd></div><div><dt className="text-muted-foreground">บำรุงล่าสุด</dt><dd>{displayDate(equipment.lastMaintenanceDate)}</dd></div>
            <div className="sm:col-span-2 lg:col-span-3"><dt className="text-muted-foreground">หมายเหตุทะเบียน</dt><dd className="whitespace-pre-wrap">{equipment.note || "—"}</dd></div>
          </dl>
          <section aria-labelledby={`detail-history-${item.id}`}><h3 id={`detail-history-${item.id}`} className="font-semibold">ประวัติการบำรุง</h3>{detail.history.length ? <ul className="mt-3 space-y-2">{detail.history.map((record) => <li key={record.id} className="rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{maintenanceTypeLabels[record.type]}</p><Badge variant="outline">{maintenanceStatusLabels[record.status]}</Badge></div><p className="mt-1 text-sm text-muted-foreground">นัดหมาย {record.scheduledDate} · เสร็จ {record.completedDate ?? "—"} · {record.technician ?? "ไม่ระบุช่าง"}</p></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">ยังไม่มีประวัติการบำรุง</p>}
            <div className="mt-3 flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">หน้า {detail.historyPagination.page} จาก {Math.max(1, detail.historyPagination.totalPages)}</p><div className="flex gap-2"><Button type="button" variant="outline" className="min-h-11" disabled={pending || page <= 1} onClick={() => changePage(page - 1)}><ChevronLeft aria-hidden="true" />ก่อนหน้า</Button><Button type="button" variant="outline" className="min-h-11" disabled={pending || page >= detail.historyPagination.totalPages} onClick={() => changePage(page + 1)}>ถัดไป<ChevronRight aria-hidden="true" /></Button></div></div>
          </section>
        </div> : null}
      </DialogContent>
    </Dialog>
  );
}
