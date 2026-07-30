import type { Metadata } from "next";
import { ClassManager } from "@/components/classes/class-manager";
import { getClassDashboard } from "@/lib/class-service";
import { getCurrentBranchId } from "@/lib/branch-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "เทรนเนอร์และจองคลาส | Fitness Pro",
  description:
    "จัดตารางเทรนเนอร์ เปิดรอบคลาส และดูแลการจองสมาชิกตามจำนวนที่นั่ง",
};

/** คืนวันที่ปัจจุบันตามเขตเวลาไทยเพื่อใช้คัดรอบคลาสที่กำลังจะมาถึง */
function getBangkokToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** โหลดข้อมูลจากฝั่งเซิร์ฟเวอร์ก่อนส่งเฉพาะค่าที่ serializable ให้หน้าจัดการคลาส */
export default async function ClassesPage() {
  const dashboard = await getClassDashboard(await getCurrentBranchId());

  return (
    <div className="flex w-full max-w-7xl flex-col gap-8 p-4 sm:p-6 lg:p-8">
      <header>
        <p className="mb-1 text-sm font-medium text-primary">
          ตารางกิจกรรมและผู้ฝึกสอน
        </p>
        <h1 className="text-balance text-2xl font-bold sm:text-3xl">
          เทรนเนอร์และจองคลาส
        </h1>
        <p className="mt-1 max-w-3xl text-pretty text-sm text-muted-foreground">
          วางตารางสอนโดยไม่ชนเวลา ติดตามจำนวนที่นั่ง และยืนยันการจองของสมาชิก
          จากหน้าปฏิบัติการเดียว
        </p>
      </header>
      <ClassManager {...dashboard} today={getBangkokToday()} />
    </div>
  );
}
