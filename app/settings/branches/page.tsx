import type { Metadata } from "next";
import { BranchManager } from "@/components/branches/branch-manager";
import { getBranchesDashboard } from "@/lib/branch-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "จัดการสาขา | Fitness Pro",
  description: "เพิ่มและตรวจสอบสาขาของ Fitness Pro",
};

/** โหลดสาขาจากเซิร์ฟเวอร์และส่งข้อมูล serializable ไปยังหน้าตั้งค่า */
export default async function BranchesPage() {
  const branches = await getBranchesDashboard();
  return (
    <div className="flex w-full max-w-7xl flex-col gap-8 p-4 sm:p-6 lg:p-8">
      <header>
        <p className="mb-1 text-sm font-medium text-primary">โครงสร้างองค์กรและบริบทการทำงาน</p>
        <h1 className="text-balance text-2xl font-bold sm:text-3xl">จัดการสาขา</h1>
        <p className="mt-1 max-w-3xl text-pretty text-sm text-muted-foreground">กำหนดสาขาที่เปิดใช้งานและใช้ตัวเลือกใน sidebar เพื่อดูข้อมูลปฏิบัติการกับรายงานแยกสาขา</p>
      </header>
      <BranchManager branches={branches} />
    </div>
  );
}
