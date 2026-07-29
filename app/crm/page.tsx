import type { Metadata } from "next";
import { CrmManager } from "@/components/crm/crm-manager";
import { getCrmDashboard } from "@/lib/crm-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CRM และคะแนนสะสม | Fitness Pro",
  description: "ดูแลความสนใจสมาชิก งานติดตาม คะแนนสะสม ของรางวัล และสมาชิก inactive",
};

/** โหลดข้อมูล CRM ฝั่งเซิร์ฟเวอร์แล้วส่งเฉพาะข้อมูล serializable ไปยังส่วนโต้ตอบฝั่ง client */
export default async function CrmPage() {
  const dashboard = await getCrmDashboard();

  return (
    <div className="flex w-full max-w-7xl flex-col gap-8 p-4 sm:p-6 lg:p-8">
      <header>
        <p className="mb-1 text-sm font-medium text-primary">ความสัมพันธ์สมาชิกและการกลับมาใช้บริการ</p>
        <h1 className="text-balance text-2xl font-bold sm:text-3xl">CRM และ Loyalty Points</h1>
        <p className="mt-1 max-w-3xl text-pretty text-sm text-muted-foreground">
          รวมความสนใจ ประวัติการติดตาม คะแนนสะสม ของรางวัล และรายชื่อสมาชิกที่ไม่ได้เข้าใช้เกิน 30 วันไว้ในที่เดียว
        </p>
      </header>
      <CrmManager {...dashboard} />
    </div>
  );
}
