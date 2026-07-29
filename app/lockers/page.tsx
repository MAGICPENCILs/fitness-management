import type { Metadata } from "next";
import { LockerManager } from "@/components/lockers/locker-manager";
import { getLockerDashboard } from "@/lib/locker-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "จัดการล็อกเกอร์ | Fitness Pro",
  description: "ตรวจสถานะ มอบ คืน และติดตามการเช่าล็อกเกอร์ของสมาชิกฟิตเนส",
};

/** คำนวณวันที่วันนี้และครบหนึ่งเดือนตามเขตเวลาไทยสำหรับค่าเริ่มต้นของฟอร์ม */
function getBangkokRentalDates() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(new Date());
  const monthlyEnd = new Date(`${today}T00:00:00+07:00`);
  monthlyEnd.setMonth(monthlyEnd.getMonth() + 1);
  return { today, monthlyEndDate: formatter.format(monthlyEnd) };
}

/** โหลดข้อมูลล็อกเกอร์และสมาชิกใน Server Component แล้วส่งเฉพาะข้อมูลที่ serializable ให้ส่วนโต้ตอบ */
export default async function LockersPage() {
  const dates = getBangkokRentalDates();
  const dashboard = await getLockerDashboard();
  return (
    <div className="w-full max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      <header>
        <p className="mb-1 text-sm font-medium text-primary">
          พื้นที่และสิ่งอำนวยความสะดวก
        </p>
        <h1 className="text-balance text-2xl font-bold sm:text-3xl">
          จัดการล็อกเกอร์
        </h1>
        <p className="mt-1 max-w-3xl text-pretty text-sm text-muted-foreground">
          ดูตู้ว่าง มอบล็อกเกอร์ชั่วคราวหรือรายเดือน
          และบันทึกการคืนพร้อมประวัติที่ตรวจสอบย้อนหลังได้
        </p>
      </header>
      <LockerManager {...dashboard} {...dates} />
    </div>
  );
}
