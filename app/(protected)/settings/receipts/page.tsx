import type { Metadata } from "next";
import { ReceiptSettingsForm } from "@/components/settings/receipt-settings-form";
import { getCurrentBranchId } from "@/lib/branch-service";
import { getReceiptSettingsDashboard } from "@/lib/receipt-data";
import { requirePermission } from "@/lib/staff-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ตั้งค่าใบเสร็จ | Fitness Pro",
  description: "กำหนดข้อมูลนิติบุคคลและภาษีสำหรับเอกสารการเงิน",
};

/** โหลดข้อมูลเอกสารเฉพาะสาขาปัจจุบันหลังตรวจสิทธิ์ผู้ดูแล */
export default async function ReceiptSettingsPage() {
  const branchId = await getCurrentBranchId();
  await requirePermission("settings.manage", branchId);
  const { branch, settings } = await getReceiptSettingsDashboard(branchId);

  return (
    <div className="w-full max-w-5xl space-y-8 p-4 sm:p-6 lg:p-8">
      <header>
        <p className="mb-1 text-sm font-medium text-primary">เอกสารการเงิน · {branch?.name ?? "สาขาปัจจุบัน"}</p>
        <h1 className="text-balance text-2xl font-bold sm:text-3xl">ตั้งค่าใบเสร็จและใบกำกับภาษี</h1>
        <p className="mt-1 max-w-3xl text-pretty text-sm text-muted-foreground">ข้อมูลนี้จะถูกบันทึกเป็น snapshot ตอนรับชำระ การแก้ไขภายหลังจะไม่ย้อนเปลี่ยนเอกสารเก่า</p>
      </header>
      <ReceiptSettingsForm settings={settings} />
    </div>
  );
}
