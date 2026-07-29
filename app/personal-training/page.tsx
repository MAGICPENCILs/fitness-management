import type { Metadata } from "next";
import { PersonalTrainingManager } from "@/components/personal-training/personal-training-manager";
import { getPersonalTrainingDashboard } from "@/lib/personal-training-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PT Package และผลการฝึก | Fitness Pro",
  description:
    "ดูแลสิทธิ์ PT นัดหมาย session และติดตามผลการออกกำลังกายของสมาชิก",
};

/** คืนวันที่ปัจจุบันตามเขตเวลาไทยสำหรับคัดกรองแพ็กเกจและนัดหมาย */
function getBangkokToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** โหลดข้อมูล PT จากเซิร์ฟเวอร์แล้วส่งค่าที่ serializable ให้หน้าปฏิบัติการ */
export default async function PersonalTrainingPage() {
  const dashboard = await getPersonalTrainingDashboard();

  return (
    <div className="flex w-full max-w-7xl flex-col gap-8 p-4 sm:p-6 lg:p-8">
      <header>
        <p className="mb-1 text-sm font-medium text-primary">
          การฝึกส่วนบุคคลและพัฒนาการสมาชิก
        </p>
        <h1 className="text-balance text-2xl font-bold sm:text-3xl">
          PT Package และผลการฝึก
        </h1>
        <p className="mt-1 max-w-3xl text-pretty text-sm text-muted-foreground">
          ควบคุมสิทธิ์คงเหลือ นัดหมายโดยไม่ชนตาราง และบันทึกน้ำหนัก BMI
          กับรอบเอวหลังจบการฝึกแต่ละครั้ง
        </p>
      </header>
      <PersonalTrainingManager {...dashboard} today={getBangkokToday()} />
    </div>
  );
}
