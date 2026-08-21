import type { Metadata } from "next";
import { EquipmentDashboard } from "@/components/equipment/equipment-dashboard";
import {
  getEquipmentDashboard,
  parseEquipmentDashboardFilters,
  type EquipmentSearchParams,
} from "@/lib/equipment-service";
import { getCurrentBranchId } from "@/lib/branch-service";
import { hasPermission } from "@/lib/rbac";
import { requirePermission } from "@/lib/staff-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "อุปกรณ์และการบำรุงรักษา | Fitness Pro",
  description:
    "จัดการทะเบียนอุปกรณ์ ชั่วโมงใช้งาน สถานะ และรอบบำรุงรักษาของฟิตเนส",
};

/** คืนวันที่ปัจจุบันตามเขตเวลาไทยเพื่อใช้คำนวณการแจ้งเตือนรอบบำรุง */
function getBangkokToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** ตรวจสิทธิ์อ่านจากสาขาที่เลือก แล้ว parse async searchParams เป็น allowlist ก่อนโหลดข้อมูลแบบแบ่งหน้าจาก server */
export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<EquipmentSearchParams>;
}) {
  const today = getBangkokToday();
  const branchId = await getCurrentBranchId();
  const actor = await requirePermission("equipment.read", branchId);
  const canManage = hasPermission(actor, "equipment.manage", branchId);
  const filters = parseEquipmentDashboardFilters(await searchParams);
  const dashboard = await getEquipmentDashboard(today, branchId, filters);

  return (
    <div className="w-full max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      <header>
        <p className="mb-1 text-sm font-medium text-primary">
          ทรัพย์สินและความพร้อมใช้งาน
        </p>
        <h1 className="text-balance text-2xl font-bold sm:text-3xl">
          อุปกรณ์และการบำรุงรักษา
        </h1>
        <p className="mt-1 max-w-3xl text-pretty text-sm text-muted-foreground">
          ติดตามชั่วโมงใช้งาน สถานะหน้างาน และกำหนดบำรุงจากทั้งมิเตอร์และวันที่
          พร้อมประวัติงานที่ตรวจสอบย้อนหลังได้
        </p>
      </header>
      <EquipmentDashboard
        {...dashboard}
        filters={filters}
        today={today}
        canManage={canManage}
      />
    </div>
  );
}
