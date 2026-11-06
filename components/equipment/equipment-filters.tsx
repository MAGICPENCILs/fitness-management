import Link from "next/link";
import { Filter, RotateCcw, Search } from "lucide-react";
import { buildEquipmentHref } from "@/components/equipment/equipment-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EquipmentDashboardFilters } from "@/lib/equipment-service";

const selectClassName =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** ส่งสถานะของอีก tab เป็น hidden fields เพื่อให้การใช้ตัวกรองไม่ล้างบริบทที่ผู้ใช้ยังไม่ได้เปลี่ยน */
function CrossTabHistoryFields({
  filters,
}: {
  filters: EquipmentDashboardFilters;
}) {
  return (
    <>
      <input type="hidden" name="historyPage" value={filters.historyPage} />
      {filters.historyEquipmentId ? (
        <input
          type="hidden"
          name="historyEquipmentId"
          value={filters.historyEquipmentId}
        />
      ) : null}
      {filters.historyType && filters.historyType !== "ALL" ? (
        <input type="hidden" name="historyType" value={filters.historyType} />
      ) : null}
      {filters.historyStatus && filters.historyStatus !== "ALL" ? (
        <input
          type="hidden"
          name="historyStatus"
          value={filters.historyStatus}
        />
      ) : null}
    </>
  );
}

/** ส่งตัวกรองทะเบียนเดิมไปกับแบบฟอร์มประวัติ เพื่อให้สลับ tab แล้วย้อนกลับได้โดยไม่เสียบริบท */
function CrossTabEquipmentFields({
  filters,
}: {
  filters: EquipmentDashboardFilters;
}) {
  return (
    <>
      {filters.search ? (
        <input type="hidden" name="search" value={filters.search} />
      ) : null}
      {filters.status !== "ALL" ? (
        <input type="hidden" name="status" value={filters.status} />
      ) : null}
      {filters.category !== "ALL" ? (
        <input type="hidden" name="category" value={filters.category} />
      ) : null}
      {filters.maintenance !== "ALL" ? (
        <input
          type="hidden"
          name="maintenance"
          value={filters.maintenance}
        />
      ) : null}
      <input type="hidden" name="page" value={filters.page} />
    </>
  );
}

/** remount เฉพาะเมื่อ applied filter เปลี่ยน เพื่อให้ Reset/navigation ตรง URL โดยไม่ล้าง draft ระหว่าง render ปกติ */
export function EquipmentFilters({
  filters,
}: {
  filters: EquipmentDashboardFilters;
}) {
  return (
    <form
      key={JSON.stringify([filters.search, filters.status, filters.category, filters.maintenance])}
      action="/equipment"
      method="get"
      aria-label="ตัวกรองทะเบียนอุปกรณ์"
      className="rounded-xl border bg-card p-4 shadow-sm"
    >
      <input type="hidden" name="tab" value="equipment" />
      <input type="hidden" name="page" value="1" />
      <CrossTabHistoryFields filters={filters} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="equipment-search">ค้นหาอุปกรณ์</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="equipment-search"
              name="search"
              defaultValue={filters.search}
              placeholder="รหัส ชื่อ Serial หรือตำแหน่ง"
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="equipment-status">สถานะอุปกรณ์</Label>
          <select
            id="equipment-status"
            name="status"
            defaultValue={filters.status}
            className={selectClassName}
          >
            <option value="ALL">ทุกสถานะ</option>
            <option value="OPERATIONAL">พร้อมใช้งาน</option>
            <option value="MAINTENANCE">อยู่ระหว่างบำรุง</option>
            <option value="OUT_OF_SERVICE">หยุดใช้งานชั่วคราว</option>
            <option value="RETIRED">เลิกใช้งาน</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="equipment-category">หมวดหมู่</Label>
          <select
            id="equipment-category"
            name="category"
            defaultValue={filters.category}
            className={selectClassName}
          >
            <option value="ALL">ทุกหมวดหมู่</option>
            <option value="CARDIO">คาร์ดิโอ</option>
            <option value="STRENGTH">แมชชีนเวท</option>
            <option value="FREE_WEIGHT">ฟรีเวท</option>
            <option value="ACCESSORY">อุปกรณ์เสริม</option>
            <option value="OTHER">อื่น ๆ</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="equipment-maintenance">กำหนดบำรุง</Label>
          <select
            id="equipment-maintenance"
            name="maintenance"
            defaultValue={filters.maintenance}
            className={selectClassName}
          >
            <option value="ALL">ทุกกำหนด</option>
            <option value="OVERDUE">เกินกำหนด</option>
            <option value="DUE_SOON">ใกล้ถึงกำหนด</option>
            <option value="SCHEDULED">มีกำหนดบำรุง</option>
            <option value="NONE">ยังไม่กำหนดรอบ</option>
          </select>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit">
          <Filter aria-hidden="true" />
          ใช้ตัวกรอง
        </Button>
        <Button asChild variant="outline">
          <Link
            href={buildEquipmentHref(filters, {
              search: null,
              status: null,
              category: null,
              maintenance: null,
              page: null,
            })}
          >
            <RotateCcw aria-hidden="true" />
            คืนค่าตัวกรองทะเบียน
          </Link>
        </Button>
      </div>
    </form>
  );
}

/** เปลี่ยนชุด control เมื่อ applied history filter เปลี่ยน เพื่อไม่ส่งค่าค้างหลัง Reset/navigation */
export function MaintenanceHistoryFilters({
  filters,
}: {
  filters: EquipmentDashboardFilters;
}) {
  return (
    <form
      key={JSON.stringify([filters.historyEquipmentId, filters.historyType, filters.historyStatus])}
      action="/equipment"
      method="get"
      aria-label="ตัวกรองประวัติการบำรุงรักษา"
      className="rounded-xl border bg-card p-4 shadow-sm"
    >
      <input type="hidden" name="tab" value="history" />
      <input type="hidden" name="historyPage" value="1" />
      <CrossTabEquipmentFields filters={filters} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="history-equipment-id">อุปกรณ์ ID</Label>
          <Input
            id="history-equipment-id"
            name="historyEquipmentId"
            type="number"
            min="1"
            inputMode="numeric"
            defaultValue={filters.historyEquipmentId ?? ""}
            placeholder="ทุกอุปกรณ์"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="history-type">ประเภทงาน</Label>
          <select
            id="history-type"
            name="historyType"
            defaultValue={filters.historyType ?? "ALL"}
            className={selectClassName}
          >
            <option value="ALL">ทุกประเภท</option>
            <option value="INSPECTION">ตรวจสภาพ</option>
            <option value="PREVENTIVE">บำรุงเชิงป้องกัน</option>
            <option value="REPAIR">ซ่อมแซม</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="history-status">สถานะงาน</Label>
          <select
            id="history-status"
            name="historyStatus"
            defaultValue={filters.historyStatus ?? "ALL"}
            className={selectClassName}
          >
            <option value="ALL">ทุกสถานะ</option>
            <option value="SCHEDULED">นัดหมายแล้ว</option>
            <option value="IN_PROGRESS">กำลังดำเนินการ</option>
            <option value="COMPLETED">เสร็จสิ้น</option>
          </select>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit">
          <Filter aria-hidden="true" />
          ใช้ตัวกรอง
        </Button>
        <Button asChild variant="outline">
          <Link
            href={buildEquipmentHref(filters, {
              historyEquipmentId: null,
              historyType: null,
              historyStatus: null,
              historyPage: null,
            })}
          >
            <RotateCcw aria-hidden="true" />
            คืนค่าตัวกรองประวัติ
          </Link>
        </Button>
      </div>
    </form>
  );
}
