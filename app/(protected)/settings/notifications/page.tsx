import { NotificationManager } from "@/components/settings/notification-manager";
import { LineProviderSettingsCard } from "@/components/settings/line-provider-settings-card";
import { getCurrentBranchId } from "@/lib/branch-service";
import { getLineProviderSettingsDto } from "@/lib/line-provider-settings-service";
import { hasPermission } from "@/lib/rbac";
import {
  getNotificationHistory,
  getNotificationProviderHealth,
  getNotificationSettings,
} from "@/lib/notification-engine";
import { requirePermission } from "@/lib/staff-service";

export const dynamic = "force-dynamic";

/** ไม่อ่านหรือส่งข้อมูลผู้ให้บริการให้ผู้จัดการ และแยกความผิดพลาดของ LINE ออกจากกฎแจ้งเตือน */
export default async function NotificationsPage() {
  const branchId = await getCurrentBranchId();
  const actor = await requirePermission("settings.manage", branchId);
  const canManageProvider = hasPermission(actor, "provider.credentials.manage");
  const [settings, history, provider] = await Promise.all([
    getNotificationSettings(),
    getNotificationHistory(branchId),
    canManageProvider ? getLineProviderSettingsDto(actor).catch(() => null) : null,
  ]);
  const providerHealth = getNotificationProviderHealth();

  return (
    <div className="w-full max-w-6xl space-y-8 p-4 sm:p-6 lg:p-8">
      <header>
        <p className="mb-1 text-sm font-medium text-primary">การดูแลสมาชิก</p>
        <h1 className="text-balance text-2xl font-bold sm:text-3xl">ระบบแจ้งเตือน</h1>
        <p className="mt-1 max-w-3xl text-pretty text-sm text-muted-foreground">
          ตั้งค่าแจ้งเตือนก่อนหมดอายุ ติดตามสมาชิกที่ไม่ได้เข้าใช้บริการ และตรวจสอบคิว SMS, อีเมล และข้อความในระบบ โดย LINE OA ยังไม่พร้อมใช้งาน
        </p>
      </header>
      {canManageProvider && (provider ? <LineProviderSettingsCard initial={provider} /> : (
        <p className="rounded-xl border bg-card p-4" role="alert">การตั้งค่า LINE ยังไม่พร้อมใช้งาน โปรดติดต่อผู้ดูแลระบบ การส่ง LINE ยังปิดอยู่</p>
      ))}
      <NotificationManager
        settings={{
          reminderDays: settings.reminderDays,
          inactivityDays: settings.inactivityDays,
          enableInApp: settings.enableInApp,
          enableSms: settings.enableSms,
          enableLine: false,
          enableEmail: settings.enableEmail,
          isActive: settings.isActive,
        }}
        history={history.map((item) => ({
          ...item,
          scheduledFor: item.scheduledFor.toISOString().slice(0, 10),
          createdAt: item.createdAt?.toISOString() ?? null,
          lastAttemptAt: item.lastAttemptAt?.toISOString() ?? null,
        }))}
        providerHealth={providerHealth}
      />
    </div>
  );
}
