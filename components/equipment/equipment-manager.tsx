"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Gauge,
  History,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Wrench,
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

type EquipmentCategory =
  | "CARDIO"
  | "STRENGTH"
  | "FREE_WEIGHT"
  | "ACCESSORY"
  | "OTHER";
type EquipmentStatus = "OPERATIONAL" | "MAINTENANCE" | "OUT_OF_SERVICE";
type MaintenanceState = "OVERDUE" | "DUE_SOON" | "SCHEDULED" | "NONE";
type MaintenanceType = "INSPECTION" | "PREVENTIVE" | "REPAIR";
type MaintenanceStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED";

type EquipmentItem = {
  id: number;
  code: string;
  name: string;
  category: EquipmentCategory;
  location: string;
  serialNumber: string | null;
  status: EquipmentStatus;
  purchaseDate: string | null;
  warrantyEndDate: string | null;
  currentUsageHours: number;
  maintenanceIntervalHours: number | null;
  nextMaintenanceHours: number | null;
  nextMaintenanceDate: string | null;
  lastMaintenanceDate: string | null;
  note: string | null;
  maintenanceState: MaintenanceState;
  remainingHours: number | null;
  remainingDays: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type MaintenanceHistory = {
  id: number;
  equipmentId: number;
  equipmentCode: string;
  equipmentName: string;
  type: MaintenanceType;
  status: MaintenanceStatus;
  scheduledDate: string;
  completedDate: string | null;
  usageHoursAtService: number | null;
  cost: number;
  technician: string | null;
  note: string | null;
  createdAt: string | null;
};

const categoryLabels: Record<EquipmentCategory, string> = {
  CARDIO: "คาร์ดิโอ",
  STRENGTH: "เวทแมชชีน",
  FREE_WEIGHT: "ฟรีเวท",
  ACCESSORY: "อุปกรณ์เสริม",
  OTHER: "อื่น ๆ",
};
const statusLabels: Record<EquipmentStatus, string> = {
  OPERATIONAL: "พร้อมใช้งาน",
  MAINTENANCE: "กำลังบำรุง",
  OUT_OF_SERVICE: "งดใช้งาน",
};
const maintenanceTypeLabels: Record<MaintenanceType, string> = {
  INSPECTION: "ตรวจสภาพ",
  PREVENTIVE: "บำรุงเชิงป้องกัน",
  REPAIR: "ซ่อม",
};
const maintenanceStatusLabels: Record<MaintenanceStatus, string> = {
  SCHEDULED: "นัดหมาย",
  IN_PROGRESS: "กำลังดำเนินการ",
  COMPLETED: "เสร็จแล้ว",
};
const dateFormat = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeZone: "Asia/Bangkok",
});
const money = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 2,
});

/** จัดรูปแบบวันที่โดยตรึงเวลาไทยเพื่อป้องกันวันที่เลื่อนเมื่อแสดงผล */
function formatDate(value: string | null) {
  if (!value) return "-";
  return dateFormat.format(
    new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value),
  );
}

/** สรุปกำหนดบำรุงจากทั้งชั่วโมงและวันที่ให้พนักงานอ่านได้ในบรรทัดเดียว */
function getScheduleText(item: EquipmentItem) {
  const details: string[] = [];
  if (item.remainingHours !== null) {
    details.push(
      item.remainingHours < 0
        ? `เกิน ${Math.abs(item.remainingHours).toLocaleString("th-TH")} ชม.`
        : `อีก ${item.remainingHours.toLocaleString("th-TH")} ชม.`,
    );
  }
  if (item.remainingDays !== null) {
    details.push(
      item.remainingDays < 0
        ? `เกิน ${Math.abs(item.remainingDays).toLocaleString("th-TH")} วัน`
        : item.remainingDays === 0
          ? "ครบกำหนดวันนี้"
          : `อีก ${item.remainingDays.toLocaleString("th-TH")} วัน`,
    );
  }
  return details.join(" · ") || "ยังไม่กำหนดรอบ";
}

/** รวมทะเบียน มิเตอร์ งานซ่อม และประวัติไว้ในหน้าปฏิบัติการเดียว */
export function EquipmentManager({
  equipment,
  history,
  today,
}: {
  equipment: EquipmentItem[];
  history: MaintenanceHistory[];
  today: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [operationItem, setOperationItem] = useState<EquipmentItem | null>(null);
  const [maintenanceItem, setMaintenanceItem] = useState<EquipmentItem | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [createForm, setCreateForm] = useState({
    code: "",
    name: "",
    category: "CARDIO" as EquipmentCategory,
    location: "",
    serialNumber: "",
    purchaseDate: "",
    warrantyEndDate: "",
    currentUsageHours: "0",
    maintenanceIntervalHours: "",
    nextMaintenanceDate: "",
    note: "",
  });
  const [operationForm, setOperationForm] = useState({
    currentUsageHours: "0",
    status: "OPERATIONAL" as EquipmentStatus,
  });
  const [maintenanceForm, setMaintenanceForm] = useState({
    type: "PREVENTIVE" as MaintenanceType,
    status: "COMPLETED" as MaintenanceStatus,
    scheduledDate: today,
    completedDate: today,
    usageHoursAtService: "0",
    cost: "0",
    technician: "",
    nextMaintenanceDate: "",
    note: "",
  });

  const operationalCount = equipment.filter(
    (item) => item.status === "OPERATIONAL",
  ).length;
  const unavailableCount = equipment.length - operationalCount;
  const alertItems = equipment.filter(
    (item) =>
      item.maintenanceState === "OVERDUE" ||
      item.maintenanceState === "DUE_SOON",
  );
  const visibleEquipment = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("th-TH");
    return equipment.filter((item) => {
      const matchesStatus =
        statusFilter === "ALL" || item.status === statusFilter;
      const matchesSearch =
        !query ||
        `${item.code} ${item.name} ${item.location}`
          .toLocaleLowerCase("th-TH")
          .includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [equipment, search, statusFilter]);

  /** เปิดฟอร์มอัปเดตพร้อมเติมค่าล่าสุดจากอุปกรณ์ที่เลือก */
  const openOperation = (item: EquipmentItem) => {
    setOperationItem(item);
    setOperationForm({
      currentUsageHours: String(item.currentUsageHours),
      status: item.status,
    });
  };

  /** เปิดฟอร์มบำรุงพร้อมใช้มิเตอร์ปัจจุบันเป็นค่าเริ่มต้น */
  const openMaintenance = (item: EquipmentItem) => {
    setMaintenanceItem(item);
    setMaintenanceForm({
      type: "PREVENTIVE",
      status: "COMPLETED",
      scheduledDate: today,
      completedDate: today,
      usageHoursAtService: String(item.currentUsageHours),
      cost: "0",
      technician: "",
      nextMaintenanceDate: "",
      note: "",
    });
  };

  /** ส่งคำขอ API และแปลงข้อผิดพลาดให้แสดงในรูปแบบเดียวกันทุกฟอร์ม */
  const requestJson = async (url: string, method: string, body: unknown) => {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error ?? "ไม่สามารถบันทึกข้อมูลได้");
    return result as { message: string };
  };

  /** เพิ่มอุปกรณ์ใหม่และส่งเฉพาะค่ารอบบำรุงที่ผู้ใช้กรอกจริง */
  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const result = await requestJson("/api/equipment", "POST", {
        ...createForm,
        currentUsageHours: Number(createForm.currentUsageHours),
        maintenanceIntervalHours: createForm.maintenanceIntervalHours
          ? Number(createForm.maintenanceIntervalHours)
          : undefined,
      });
      setCreateOpen(false);
      setCreateForm({
        code: "",
        name: "",
        category: "CARDIO",
        location: "",
        serialNumber: "",
        purchaseDate: "",
        warrantyEndDate: "",
        currentUsageHours: "0",
        maintenanceIntervalHours: "",
        nextMaintenanceDate: "",
        note: "",
      });
      setFeedback({ type: "success", message: result.message });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "เพิ่มอุปกรณ์ไม่สำเร็จ",
      });
    } finally {
      setBusy(false);
    }
  };

  /** อัปเดตมิเตอร์แบบเพิ่มขึ้นเท่านั้นพร้อมสถานะความพร้อมใช้งาน */
  const handleOperation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!operationItem) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await requestJson(
        `/api/equipment/${operationItem.id}`,
        "PATCH",
        {
          currentUsageHours: Number(operationForm.currentUsageHours),
          status: operationForm.status,
        },
      );
      setOperationItem(null);
      setFeedback({ type: "success", message: result.message });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "อัปเดตอุปกรณ์ไม่สำเร็จ",
      });
    } finally {
      setBusy(false);
    }
  };

  /** บันทึกงานบำรุงและส่งวันเสร็จเฉพาะเมื่อปิดงานแล้ว */
  const handleMaintenance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!maintenanceItem) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await requestJson(
        `/api/equipment/${maintenanceItem.id}/maintenance`,
        "POST",
        {
          ...maintenanceForm,
          completedDate:
            maintenanceForm.status === "COMPLETED"
              ? maintenanceForm.completedDate
              : undefined,
          usageHoursAtService: Number(maintenanceForm.usageHoursAtService),
          cost: Number(maintenanceForm.cost),
        },
      );
      setMaintenanceItem(null);
      setFeedback({ type: "success", message: result.message });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "บันทึกงานบำรุงไม่สำเร็จ",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section aria-label="สรุปสถานะอุปกรณ์" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="อุปกรณ์ทั้งหมด" value={equipment.length} icon={Activity} tone="info" />
        <StatCard label="พร้อมใช้งาน" value={operationalCount} icon={ShieldCheck} tone="success" />
        <StatCard label="หยุดใช้งานชั่วคราว" value={unavailableCount} icon={Wrench} tone="warning" />
        <StatCard label="ต้องดูแลเร็ว ๆ นี้" value={alertItems.length} icon={AlertTriangle} tone={alertItems.length ? "destructive" : "primary"} />
      </section>

      {feedback && (
        <div
          role={feedback.type === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`rounded-xl border p-4 text-sm ${
            feedback.type === "error"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-success/30 bg-success-surface text-success"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {alertItems.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-warning/30 bg-warning-surface">
          <div className="flex items-center gap-3 border-b border-warning/20 px-5 py-4">
            <span className="flex size-10 items-center justify-center rounded-lg bg-warning/20 text-warning-foreground">
              <CalendarClock className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-semibold">รายการที่ควรวางแผนบำรุง</h2>
              <p className="text-sm text-muted-foreground">เรียงจากอุปกรณ์ที่เกินหรือใกล้ถึงกำหนด</p>
            </div>
          </div>
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {alertItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openMaintenance(item)}
                className="flex min-h-16 items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.code} · {item.name}</span>
                  <span className="block text-sm text-muted-foreground">{getScheduleText(item)}</span>
                </span>
                <Badge variant={item.maintenanceState === "OVERDUE" ? "destructive" : "secondary"}>
                  {item.maintenanceState === "OVERDUE" ? "เกินกำหนด" : "ใกล้ถึงกำหนด"}
                </Badge>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b p-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">ทะเบียนอุปกรณ์</h2>
            <p className="text-sm text-muted-foreground">ค้นหา อัปเดตมิเตอร์ และเปิดงานบำรุงจากรายการด้านล่าง</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            เพิ่มอุปกรณ์
          </Button>
        </div>
        <div className="grid gap-3 border-b p-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="ค้นหารหัส ชื่อ หรือตำแหน่ง" aria-label="ค้นหาอุปกรณ์" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full" aria-label="กรองตามสถานะ"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value="ALL">ทุกสถานะ</SelectItem>
              {Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
        </div>
        {visibleEquipment.length ? (
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            {visibleEquipment.map((item) => (
              <article key={item.id} className="rounded-xl border bg-background p-5 transition-shadow hover:shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{item.code}</Badge>
                      <Badge variant={item.status === "OUT_OF_SERVICE" ? "destructive" : "secondary"}>{statusLabels[item.status]}</Badge>
                    </div>
                    <h3 className="mt-2 truncate text-lg font-semibold">{item.name}</h3>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="size-4" aria-hidden="true" />{item.location} · {categoryLabels[item.category]}</p>
                  </div>
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-info-surface text-info"><Gauge className="size-5" aria-hidden="true" /></span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-4 text-sm">
                  <div><p className="text-muted-foreground">มิเตอร์ปัจจุบัน</p><p className="mt-1 font-semibold tabular-nums">{item.currentUsageHours.toLocaleString("th-TH")} ชม.</p></div>
                  <div><p className="text-muted-foreground">รอบถัดไป</p><p className="mt-1 font-semibold">{getScheduleText(item)}</p></div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => openOperation(item)}><Gauge data-icon="inline-start" aria-hidden="true" />อัปเดตมิเตอร์</Button>
                  <Button size="sm" onClick={() => openMaintenance(item)}><Wrench data-icon="inline-start" aria-hidden="true" />บันทึกงานบำรุง</Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center text-sm text-muted-foreground">{equipment.length ? "ไม่พบอุปกรณ์ที่ตรงกับตัวกรอง" : "ยังไม่มีอุปกรณ์ เริ่มต้นด้วยการเพิ่มรายการแรก"}</div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b p-5">
          <History className="size-5 text-primary" aria-hidden="true" />
          <div><h2 className="text-lg font-semibold">ประวัติการบำรุงรักษา</h2><p className="text-sm text-muted-foreground">รายการล่าสุด 50 งาน</p></div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>อุปกรณ์</TableHead><TableHead>ประเภท</TableHead><TableHead>สถานะ</TableHead><TableHead>วันที่</TableHead><TableHead>ผู้ดูแล</TableHead><TableHead className="text-right">ค่าใช้จ่าย</TableHead></TableRow></TableHeader>
            <TableBody>
              {history.length ? history.map((record) => (
                <TableRow key={record.id}>
                  <TableCell><p className="font-medium">{record.equipmentName}</p><p className="text-xs text-muted-foreground">{record.equipmentCode} · {record.usageHoursAtService?.toLocaleString("th-TH") ?? "-"} ชม.</p></TableCell>
                  <TableCell>{maintenanceTypeLabels[record.type]}</TableCell>
                  <TableCell><Badge variant={record.status === "COMPLETED" ? "secondary" : "outline"}>{maintenanceStatusLabels[record.status]}</Badge></TableCell>
                  <TableCell>{formatDate(record.completedDate ?? record.scheduledDate)}</TableCell>
                  <TableCell>{record.technician || "-"}</TableCell>
                  <TableCell className="text-right tabular-nums">{money.format(record.cost)}</TableCell>
                </TableRow>
              )) : <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">ยังไม่มีประวัติการบำรุงรักษา</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </section>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>เพิ่มอุปกรณ์</DialogTitle><DialogDescription>ลงทะเบียนข้อมูลหลักและรอบบำรุงเริ่มต้น</DialogDescription></DialogHeader>
          <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="equipment-code">รหัสอุปกรณ์</Label><Input id="equipment-code" required value={createForm.code} onChange={(event) => setCreateForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="EQ-001" /></div>
            <div className="space-y-2"><Label htmlFor="equipment-name">ชื่ออุปกรณ์</Label><Input id="equipment-name" required value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} /></div>
            <div className="space-y-2"><Label>หมวดหมู่</Label><Select value={createForm.category} onValueChange={(value: EquipmentCategory) => setCreateForm((current) => ({ ...current, category: value }))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{Object.entries(categoryLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="equipment-location">ตำแหน่งติดตั้ง</Label><Input id="equipment-location" required value={createForm.location} onChange={(event) => setCreateForm((current) => ({ ...current, location: event.target.value }))} placeholder="โซนคาร์ดิโอ ชั้น 1" /></div>
            <div className="space-y-2"><Label htmlFor="equipment-serial">Serial number</Label><Input id="equipment-serial" value={createForm.serialNumber} onChange={(event) => setCreateForm((current) => ({ ...current, serialNumber: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="equipment-hours">ชั่วโมงใช้งานปัจจุบัน</Label><Input id="equipment-hours" type="number" min="0" step="1" required value={createForm.currentUsageHours} onChange={(event) => setCreateForm((current) => ({ ...current, currentUsageHours: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="equipment-interval">บำรุงทุก (ชั่วโมง)</Label><Input id="equipment-interval" type="number" min="1" step="1" value={createForm.maintenanceIntervalHours} onChange={(event) => setCreateForm((current) => ({ ...current, maintenanceIntervalHours: event.target.value }))} placeholder="เช่น 500" /></div>
            <div className="space-y-2"><Label htmlFor="equipment-next-date">กำหนดบำรุงตามวันที่</Label><Input id="equipment-next-date" type="date" value={createForm.nextMaintenanceDate} onChange={(event) => setCreateForm((current) => ({ ...current, nextMaintenanceDate: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="equipment-purchase">วันที่ซื้อ</Label><Input id="equipment-purchase" type="date" value={createForm.purchaseDate} onChange={(event) => setCreateForm((current) => ({ ...current, purchaseDate: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="equipment-warranty">สิ้นสุดประกัน</Label><Input id="equipment-warranty" type="date" value={createForm.warrantyEndDate} onChange={(event) => setCreateForm((current) => ({ ...current, warrantyEndDate: event.target.value }))} /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="equipment-note">หมายเหตุ</Label><Input id="equipment-note" value={createForm.note} onChange={(event) => setCreateForm((current) => ({ ...current, note: event.target.value }))} /></div>
            <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>ยกเลิก</Button><Button type="submit" disabled={busy}>{busy ? "กำลังบันทึก..." : "เพิ่มอุปกรณ์"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(operationItem)} onOpenChange={(open) => !open && setOperationItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>อัปเดตมิเตอร์และสถานะ</DialogTitle><DialogDescription>{operationItem?.code} · {operationItem?.name}</DialogDescription></DialogHeader>
          <form onSubmit={handleOperation} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="operation-hours">ชั่วโมงใช้งานสะสม</Label><Input id="operation-hours" type="number" min={operationItem?.currentUsageHours ?? 0} step="1" required value={operationForm.currentUsageHours} onChange={(event) => setOperationForm((current) => ({ ...current, currentUsageHours: event.target.value }))} /><p className="text-xs text-muted-foreground">ค่าต้องไม่น้อยกว่า {(operationItem?.currentUsageHours ?? 0).toLocaleString("th-TH")} ชั่วโมง</p></div>
            <div className="space-y-2"><Label>สถานะหน้างาน</Label><Select value={operationForm.status} onValueChange={(value: EquipmentStatus) => setOperationForm((current) => ({ ...current, status: value }))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOperationItem(null)} disabled={busy}>ยกเลิก</Button><Button type="submit" disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(maintenanceItem)} onOpenChange={(open) => !open && setMaintenanceItem(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>บันทึกงานบำรุงรักษา</DialogTitle><DialogDescription>{maintenanceItem?.code} · {maintenanceItem?.name}</DialogDescription></DialogHeader>
          <form onSubmit={handleMaintenance} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>ประเภทงาน</Label><Select value={maintenanceForm.type} onValueChange={(value: MaintenanceType) => setMaintenanceForm((current) => ({ ...current, type: value }))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{Object.entries(maintenanceTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
            <div className="space-y-2"><Label>สถานะงาน</Label><Select value={maintenanceForm.status} onValueChange={(value: MaintenanceStatus) => setMaintenanceForm((current) => ({ ...current, status: value }))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{Object.entries(maintenanceStatusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="maintenance-scheduled">วันที่นัดหมาย</Label><Input id="maintenance-scheduled" type="date" required value={maintenanceForm.scheduledDate} onChange={(event) => setMaintenanceForm((current) => ({ ...current, scheduledDate: event.target.value }))} /></div>
            {maintenanceForm.status === "COMPLETED" && <div className="space-y-2"><Label htmlFor="maintenance-completed">วันที่เสร็จงาน</Label><Input id="maintenance-completed" type="date" required value={maintenanceForm.completedDate} onChange={(event) => setMaintenanceForm((current) => ({ ...current, completedDate: event.target.value }))} /></div>}
            <div className="space-y-2"><Label htmlFor="maintenance-hours">ชั่วโมง ณ วันที่บำรุง</Label><Input id="maintenance-hours" type="number" min={maintenanceItem?.currentUsageHours ?? 0} step="1" required value={maintenanceForm.usageHoursAtService} onChange={(event) => setMaintenanceForm((current) => ({ ...current, usageHoursAtService: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="maintenance-cost">ค่าใช้จ่าย (บาท)</Label><Input id="maintenance-cost" type="number" min="0" step="0.01" required value={maintenanceForm.cost} onChange={(event) => setMaintenanceForm((current) => ({ ...current, cost: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="maintenance-technician">ช่าง / ผู้รับผิดชอบ</Label><Input id="maintenance-technician" value={maintenanceForm.technician} onChange={(event) => setMaintenanceForm((current) => ({ ...current, technician: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="maintenance-next-date">กำหนดบำรุงครั้งถัดไป</Label><Input id="maintenance-next-date" type="date" value={maintenanceForm.nextMaintenanceDate} onChange={(event) => setMaintenanceForm((current) => ({ ...current, nextMaintenanceDate: event.target.value }))} /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="maintenance-note">รายละเอียดงาน</Label><Input id="maintenance-note" value={maintenanceForm.note} onChange={(event) => setMaintenanceForm((current) => ({ ...current, note: event.target.value }))} placeholder="อะไหล่ที่เปลี่ยนหรือผลการตรวจ" /></div>
            <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setMaintenanceItem(null)} disabled={busy}>ยกเลิก</Button><Button type="submit" disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึกงานบำรุง"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
