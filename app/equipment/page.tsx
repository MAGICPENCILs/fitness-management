import type { Metadata } from "next";
import { EquipmentManager } from "@/components/equipment/equipment-manager";
import { getEquipmentDashboard } from "@/lib/equipment-service";
import { getCurrentBranchId } from "@/lib/branch-service";

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

/** โหลดทะเบียนและประวัติจากฝั่งเซิร์ฟเวอร์ก่อนส่งข้อมูลที่ serializable ให้หน้าจอจัดการ */
export default async function EquipmentPage() {
  const today = getBangkokToday();
  const dashboard = await getEquipmentDashboard(today, await getCurrentBranchId());

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
      <EquipmentManager {...dashboard} today={today} />
    </div>
  );
}
