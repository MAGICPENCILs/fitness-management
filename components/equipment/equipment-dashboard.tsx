import Link from "next/link";
import { ClipboardList, History } from "lucide-react";
import { EquipmentFilters, MaintenanceHistoryFilters } from "@/components/equipment/equipment-filters";
import { EquipmentList } from "@/components/equipment/equipment-list";
import { EquipmentSummary } from "@/components/equipment/equipment-summary";
import { MaintenanceHistory } from "@/components/equipment/maintenance-history";
import {
  buildEquipmentHref,
  type EquipmentDashboardProps,
} from "@/components/equipment/equipment-types";

/** แสดงวันอ้างอิงของข้อมูลด้วย UTC เพื่อให้วันที่ Bangkok ที่ server ส่งมาไม่เลื่อนตามเครื่องผู้ใช้ */
function formatToday(today: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${today}T00:00:00.000Z`));
}

export function EquipmentDashboard(props: EquipmentDashboardProps) {
  const {
    summary,
    equipment,
    history,
    equipmentPagination,
    historyPagination,
    filters,
    today,
  } = props;
  const equipmentActive = filters.tab === "equipment";

  return (
    <div className="min-w-0 space-y-6 overflow-x-clip">
      <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium">มุมมองแบบอ่านอย่างเดียว</p>
        <p className="text-sm text-muted-foreground">
          ข้อมูลรอบบำรุง ณ {formatToday(today)}
        </p>
      </div>

      <EquipmentSummary summary={summary} />

      <nav
        aria-label="มุมมองข้อมูลอุปกรณ์"
        className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/40 p-1"
      >
        <Link
          href={buildEquipmentHref(filters, { tab: "equipment", page: 1 })}
          aria-current={equipmentActive ? "page" : undefined}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-center text-sm font-medium text-muted-foreground outline-none hover:bg-card hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-card aria-[current=page]:text-foreground aria-[current=page]:shadow-sm"
        >
          <ClipboardList className="size-4" aria-hidden="true" />
          ทะเบียนอุปกรณ์
        </Link>
        <Link
          href={buildEquipmentHref(filters, {
            tab: "history",
            historyPage: 1,
          })}
          aria-current={!equipmentActive ? "page" : undefined}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-center text-sm font-medium text-muted-foreground outline-none hover:bg-card hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-card aria-[current=page]:text-foreground aria-[current=page]:shadow-sm"
        >
          <History className="size-4" aria-hidden="true" />
          ประวัติการบำรุงรักษา
        </Link>
      </nav>

      {equipmentActive ? (
        <>
          <EquipmentFilters filters={filters} />
          <EquipmentList
            equipment={equipment}
            pagination={equipmentPagination}
            filters={filters}
            branchIsEmpty={summary.total === 0}
          />
        </>
      ) : (
        <>
          <MaintenanceHistoryFilters filters={filters} />
          <MaintenanceHistory
            history={history}
            pagination={historyPagination}
            filters={filters}
          />
        </>
      )}
    </div>
  );
}
