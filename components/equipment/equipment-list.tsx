import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  CalendarClock,
  CheckCircle2,
  CircleOff,
  Clock3,
  MapPin,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildEquipmentHref,
  categoryLabels,
  equipmentStatusLabels,
  maintenanceStateLabels,
} from "@/components/equipment/equipment-types";
import { EquipmentPagination } from "@/components/equipment/equipment-pagination";
import { EquipmentDetailDialog } from "@/components/equipment/equipment-detail-dialog";
import { EquipmentFormDialog } from "@/components/equipment/equipment-form-dialog";
import { EquipmentMaintenanceDialog } from "@/components/equipment/equipment-maintenance-dialog";
import { EquipmentOperationDialog } from "@/components/equipment/equipment-operation-dialog";
import { EquipmentRetireDialog } from "@/components/equipment/equipment-retire-dialog";
import type {
  EquipmentDashboardFilters,
  EquipmentDto,
  PaginationDto,
} from "@/lib/equipment-service";
import type {
  EquipmentStatus,
  MaintenanceState,
} from "@/lib/equipment-core";

const statusIcons: Record<EquipmentStatus, LucideIcon> = {
  OPERATIONAL: CheckCircle2,
  MAINTENANCE: Wrench,
  OUT_OF_SERVICE: CircleOff,
  RETIRED: Archive,
};

const maintenanceIcons: Record<MaintenanceState, LucideIcon> = {
  OVERDUE: AlertTriangle,
  DUE_SOON: Clock3,
  SCHEDULED: CalendarClock,
  NONE: CalendarClock,
};

/** เลือก variant จากสถานะ แต่คงข้อความและไอคอนไว้เสมอเพื่อไม่สื่อความหมายด้วยสีล้วน */
function EquipmentStatusBadge({ status }: { status: EquipmentStatus }) {
  const Icon = statusIcons[status];
  const variant =
    status === "OPERATIONAL"
      ? "secondary"
      : status === "OUT_OF_SERVICE"
        ? "destructive"
        : "outline";
  return (
    <Badge variant={variant}>
      <Icon aria-hidden="true" />
      {equipmentStatusLabels[status]}
    </Badge>
  );
}

function MaintenanceBadge({ state }: { state: MaintenanceState }) {
  const Icon = maintenanceIcons[state];
  const variant = state === "OVERDUE" ? "destructive" : "outline";
  return (
    <Badge variant={variant}>
      <Icon aria-hidden="true" />
      {maintenanceStateLabels[state]}
    </Badge>
  );
}

/** ปิดการสื่อความเร่งด่วนเมื่อเลิกใช้งานแล้ว เพราะสถานะรอบเดิมไม่ใช่งานที่ต้องติดตามต่อ */
function MaintenancePresentation({ item }: { item: EquipmentDto }) {
  if (item.status === "RETIRED") {
    return (
      <Badge variant="outline">
        <Archive aria-hidden="true" />
        สิ้นสุดการใช้งาน
      </Badge>
    );
  }
  return <MaintenanceBadge state={item.maintenanceState} />;
}

/** แสดงทั้งมิติชั่วโมงและวันเพื่อไม่ให้ลำดับการ render บังเงื่อนไขที่เร่งด่วนกว่าซึ่ง service เลือกเป็นสถานะ */
function getScheduleText(item: EquipmentDto) {
  if (item.status === "RETIRED") return "ไม่มีรอบบำรุงเพิ่มเติม";
  const dimensions: string[] = [];
  if (item.remainingHours !== null) {
    if (item.remainingHours < 0)
      dimensions.push(
        `ชั่วโมง: เกิน ${Math.abs(item.remainingHours).toLocaleString("th-TH")} ชม.`,
      );
    else
      dimensions.push(
        `ชั่วโมง: เหลือ ${item.remainingHours.toLocaleString("th-TH")} ชม.`,
      );
  }
  if (item.remainingDays !== null) {
    if (item.remainingDays < 0)
      dimensions.push(
        `วันที่: เกิน ${Math.abs(item.remainingDays).toLocaleString("th-TH")} วัน`,
      );
    else
      dimensions.push(
        `วันที่: เหลือ ${item.remainingDays.toLocaleString("th-TH")} วัน`,
      );
  }
  return dimensions.join(" · ") || "ยังไม่กำหนดรอบ";
}

function EquipmentEmptyState({
  filters,
  branchIsEmpty,
}: {
  filters: EquipmentDashboardFilters;
  branchIsEmpty: boolean;
}) {
  if (branchIsEmpty) {
    return (
      <div className="px-4 py-12 text-center">
        <Archive className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
        <h3 className="mt-3 font-semibold">ยังไม่มีอุปกรณ์ในสาขานี้</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          เมื่อมีการลงทะเบียนอุปกรณ์ รายการจะปรากฏที่หน้านี้
        </p>
      </div>
    );
  }
  return (
    <div className="px-4 py-12 text-center">
      <CircleOff className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
      <h3 className="mt-3 font-semibold">ไม่พบอุปกรณ์ที่ตรงกับตัวกรอง</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        ลองเปลี่ยนคำค้นหรือคืนค่าตัวกรองเพื่อดูรายการทั้งหมด
      </p>
      <Button asChild variant="outline" className="mt-4">
        <Link
          href={buildEquipmentHref(filters, {
            search: null,
            status: null,
            category: null,
            maintenance: null,
            page: null,
          })}
        >
          ล้างตัวกรองอุปกรณ์
        </Link>
      </Button>
    </div>
  );
}

/** แสดง detail แก่ทุกบทบาท แต่ render mutation เฉพาะผู้มีสิทธิ์และรายการที่ยังไม่ RETIRED */
function EquipmentActions({ item, canManage, today, onNotice }: { item: EquipmentDto; canManage: boolean; today: string; onNotice: (message: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={`การทำงานสำหรับ ${item.code}`}>
      <EquipmentDetailDialog item={item} />
      {canManage && item.status !== "RETIRED" ? <>
        <EquipmentFormDialog item={item} onSuccess={onNotice} />
        <EquipmentOperationDialog item={item} onSuccess={onNotice} />
        <EquipmentMaintenanceDialog item={item} today={today} onSuccess={onNotice} />
        <EquipmentRetireDialog item={item} onSuccess={onNotice} />
      </> : null}
    </div>
  );
}

function EquipmentCard({ item, canManage, today, onNotice }: { item: EquipmentDto; canManage: boolean; today: string; onNotice: (message: string) => void }) {
  return (
    <li>
      <article className="space-y-4 rounded-xl border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold text-primary">
              {item.code}
            </p>
            <h3 className="mt-1 break-words font-semibold">{item.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {categoryLabels[item.category]} · Serial {item.serialNumber ?? "—"}
            </p>
          </div>
          <EquipmentStatusBadge status={item.status} />
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="size-4" aria-hidden="true" />
              ตำแหน่ง
            </dt>
            <dd className="mt-1 break-words">{item.location}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">ชั่วโมงใช้งาน</dt>
            <dd className="mt-1 font-medium tabular-nums">
              {item.currentUsageHours.toLocaleString("th-TH")} ชม.
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">สถานะรอบบำรุง</dt>
            <dd className="mt-1">
              <MaintenancePresentation item={item} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">รอบถัดไป</dt>
            <dd className="mt-1 font-medium">{getScheduleText(item)}</dd>
          </div>
        </dl>
        <EquipmentActions item={item} canManage={canManage} today={today} onNotice={onNotice} />
      </article>
    </li>
  );
}

export function EquipmentList({
  equipment,
  pagination,
  filters,
  branchIsEmpty,
  canManage,
  today,
  onNotice,
}: {
  equipment: EquipmentDto[];
  pagination: PaginationDto;
  filters: EquipmentDashboardFilters;
  branchIsEmpty: boolean;
  canManage: boolean;
  today: string;
  onNotice: (message: string) => void;
}) {
  return (
    <section
      aria-labelledby="equipment-list-heading"
      className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm"
    >
      <div className="border-b p-4 sm:p-5">
        <h2 id="equipment-list-heading" className="text-lg font-semibold">
          ทะเบียนอุปกรณ์
        </h2>
        <p className="text-sm text-muted-foreground">
          พบ {pagination.total.toLocaleString("th-TH")} รายการตามตัวกรอง
        </p>
      </div>
      {equipment.length === 0 ? (
        <EquipmentEmptyState filters={filters} branchIsEmpty={branchIsEmpty} />
      ) : (
        <>
          <div className="hidden md:block">
            <Table className="table-fixed">
              <TableCaption className="sr-only">
                ทะเบียนอุปกรณ์ในหน้าปัจจุบัน
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[26%]">อุปกรณ์</TableHead>
                  <TableHead className="w-[16%]">สถานะ</TableHead>
                  <TableHead className="w-[18%]">ตำแหน่ง</TableHead>
                  <TableHead className="w-[13%]">ชั่วโมงใช้งาน</TableHead>
                  <TableHead className="w-[20%]">กำหนดบำรุง</TableHead>
                  <TableHead className="w-[7%] text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {equipment.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-normal">
                      <p className="break-words font-semibold">{item.name}</p>
                      <p className="mt-1 break-all font-mono text-xs text-primary">
                        {item.code}
                      </p>
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {categoryLabels[item.category]} · Serial {item.serialNumber ?? "—"}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-normal"><EquipmentActions item={item} canManage={canManage} today={today} onNotice={onNotice} /></TableCell>
                    <TableCell className="whitespace-normal">
                      <EquipmentStatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="whitespace-normal break-words">
                      {item.location}
                    </TableCell>
                    <TableCell className="whitespace-normal tabular-nums">
                      {item.currentUsageHours.toLocaleString("th-TH")} ชม.
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <MaintenancePresentation item={item} />
                      <p className="mt-2 text-xs text-muted-foreground">
                        {getScheduleText(item)}
                      </p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul
            aria-label="ทะเบียนอุปกรณ์สำหรับมือถือ"
            className="space-y-3 p-3 md:hidden"
          >
            {equipment.map((item) => (
              <EquipmentCard key={item.id} item={item} canManage={canManage} today={today} onNotice={onNotice} />
            ))}
          </ul>
        </>
      )}
      <EquipmentPagination
        pagination={pagination}
        filters={filters}
        pageKey="page"
      />
    </section>
  );
}
