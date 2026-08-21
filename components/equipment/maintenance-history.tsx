import Link from "next/link";
import {
  CheckCircle2,
  CircleOff,
  Clock3,
  History,
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
import { EquipmentPagination } from "@/components/equipment/equipment-pagination";
import {
  buildEquipmentHref,
  maintenanceStatusLabels,
  maintenanceTypeLabels,
} from "@/components/equipment/equipment-types";
import type {
  EquipmentDashboardFilters,
  MaintenanceDto,
  PaginationDto,
} from "@/lib/equipment-service";
import type { MaintenanceStatus } from "@/lib/equipment-core";

const statusIcons: Record<MaintenanceStatus, LucideIcon> = {
  SCHEDULED: Clock3,
  IN_PROGRESS: Wrench,
  COMPLETED: CheckCircle2,
};

const money = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
});

/** แสดงวันที่ตามปฏิทินไทยโดยยึด UTC เพื่อไม่ให้ server timezone เลื่อนวัน */
function formatDate(value: string | null) {
  if (!value) return "—";
  const dateOnly = value.slice(0, 10);
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${dateOnly}T00:00:00.000Z`));
}

function MaintenanceStatusBadge({ status }: { status: MaintenanceStatus }) {
  const Icon = statusIcons[status];
  return (
    <Badge variant={status === "COMPLETED" ? "secondary" : "outline"}>
      <Icon aria-hidden="true" />
      {maintenanceStatusLabels[status]}
    </Badge>
  );
}

function MaintenanceHistoryEmpty({
  filters,
}: {
  filters: EquipmentDashboardFilters;
}) {
  const filtered = Boolean(
    filters.historyEquipmentId ||
      (filters.historyType && filters.historyType !== "ALL") ||
      (filters.historyStatus && filters.historyStatus !== "ALL"),
  );
  return (
    <div className="px-4 py-12 text-center">
      {filtered ? (
        <CircleOff className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
      ) : (
        <History className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
      )}
      <h3 className="mt-3 font-semibold">
        {filtered
          ? "ไม่พบประวัติที่ตรงกับตัวกรอง"
          : "ยังไม่มีประวัติการบำรุงรักษา"}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {filtered
          ? "ลองคืนค่าตัวกรองเพื่อดูประวัติทั้งหมด"
          : "ประวัติงานจะปรากฏเมื่อมีการบันทึกงานบำรุง"}
      </p>
      {filtered ? (
        <Button asChild variant="outline" className="mt-4">
          <Link
            href={buildEquipmentHref(filters, {
              historyEquipmentId: null,
              historyType: null,
              historyStatus: null,
              historyPage: null,
            })}
          >
            ล้างตัวกรองประวัติ
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

function MaintenanceCard({ record }: { record: MaintenanceDto }) {
  return (
    <li>
      <article className="space-y-4 rounded-xl border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold text-primary">
              {record.equipmentCode}
            </p>
            <h3 className="mt-1 break-words font-semibold">
              {record.equipmentName}
            </h3>
          </div>
          <MaintenanceStatusBadge status={record.status} />
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">ประเภทงาน</dt>
            <dd className="mt-1">{maintenanceTypeLabels[record.type]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">วันที่</dt>
            <dd className="mt-1 tabular-nums">
              {formatDate(record.completedDate ?? record.scheduledDate)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">ชั่วโมง ณ วันทำงาน</dt>
            <dd className="mt-1 tabular-nums">
              {record.usageHoursAtService?.toLocaleString("th-TH") ?? "—"} ชม.
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">ผู้ดูแล</dt>
            <dd className="mt-1 break-words">{record.technician ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">ค่าใช้จ่าย</dt>
            <dd className="mt-1 tabular-nums">{money.format(record.cost)}</dd>
          </div>
        </dl>
      </article>
    </li>
  );
}

export function MaintenanceHistory({
  history,
  pagination,
  filters,
}: {
  history: MaintenanceDto[];
  pagination: PaginationDto;
  filters: EquipmentDashboardFilters;
}) {
  return (
    <section
      aria-labelledby="maintenance-history-heading"
      className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm"
    >
      <div className="border-b p-4 sm:p-5">
        <h2 id="maintenance-history-heading" className="text-lg font-semibold">
          ประวัติการบำรุงรักษา
        </h2>
        <p className="text-sm text-muted-foreground">
          พบ {pagination.total.toLocaleString("th-TH")} รายการตามตัวกรอง
        </p>
      </div>
      {history.length === 0 ? (
        <MaintenanceHistoryEmpty filters={filters} />
      ) : (
        <>
          <div className="hidden md:block">
            <Table className="table-fixed">
              <TableCaption className="sr-only">
                ประวัติการบำรุงรักษาในหน้าปัจจุบัน
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[23%]">อุปกรณ์</TableHead>
                  <TableHead className="w-[16%]">ประเภท</TableHead>
                  <TableHead className="w-[15%]">สถานะ</TableHead>
                  <TableHead className="w-[14%]">วันที่</TableHead>
                  <TableHead className="w-[12%]">ชั่วโมง</TableHead>
                  <TableHead className="w-[12%]">ผู้ดูแล</TableHead>
                  <TableHead className="w-[8%] text-right">ค่าใช้จ่าย</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="whitespace-normal">
                      <p className="break-words font-semibold">
                        {record.equipmentName}
                      </p>
                      <p className="mt-1 break-all font-mono text-xs text-primary">
                        {record.equipmentCode}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {maintenanceTypeLabels[record.type]}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <MaintenanceStatusBadge status={record.status} />
                    </TableCell>
                    <TableCell className="whitespace-normal tabular-nums">
                      {formatDate(record.completedDate ?? record.scheduledDate)}
                    </TableCell>
                    <TableCell className="whitespace-normal tabular-nums">
                      {record.usageHoursAtService?.toLocaleString("th-TH") ?? "—"} ชม.
                    </TableCell>
                    <TableCell className="whitespace-normal break-words">
                      {record.technician ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-normal text-right tabular-nums">
                      {money.format(record.cost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul
            aria-label="ประวัติการบำรุงรักษาสำหรับมือถือ"
            className="space-y-3 p-3 md:hidden"
          >
            {history.map((record) => (
              <MaintenanceCard key={record.id} record={record} />
            ))}
          </ul>
        </>
      )}
      <EquipmentPagination
        pagination={pagination}
        filters={filters}
        pageKey="historyPage"
      />
    </section>
  );
}
