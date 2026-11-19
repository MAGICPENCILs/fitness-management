import { AccessSettingsForm } from "@/components/settings/access-settings-form";
import { getAccessSettings } from "@/lib/access-service";
import { getCurrentBranchId } from "@/lib/branch-service";
import { requirePermission } from "@/lib/staff-service";

export const dynamic = "force-dynamic";

/** แสดงกฎการเข้าใช้ที่จุดสแกนทุกแห่งใช้ร่วมกันหลังตรวจสิทธิ์ตั้งค่าระบบ */
export default async function AccessSettingsPage() {
  const branchId = await getCurrentBranchId();
  await requirePermission("settings.manage", branchId);
  const settings = await getAccessSettings();
  return (
    <div className="w-full max-w-3xl space-y-8 p-4 sm:p-6 lg:p-8">
      <header>
        <p className="mb-1 text-sm font-medium text-primary">Access control</p>
        <h1 className="text-balance text-2xl font-bold sm:text-3xl">นโยบายเข้าใช้บริการ</h1>
        <p className="mt-1 text-pretty text-sm text-muted-foreground">กำหนดช่วงผ่อนผันหลังแพ็กเกจหมดอายุ ส่วนแพ็กเกจรายวันใช้ได้หนึ่งครั้งต่อวันโดยอัตโนมัติ</p>
      </header>
      <AccessSettingsForm initialGraceDays={settings.graceDays} />
    </div>
  );
}
