import { NotificationManager } from "@/components/settings/notification-manager";
import { getNotificationHistory, getNotificationSettings } from "@/lib/notification-engine";

export const dynamic = "force-dynamic";

/** โหลดค่าตั้งและประวัติจากฐานข้อมูลโดยตรง เพื่อไม่ต้องเรียก API ภายในผ่าน localhost */
export default async function NotificationsPage() {
  const [settings, history] = await Promise.all([
    getNotificationSettings(),
    getNotificationHistory(),
  ]);

  return (
    <div className="w-full max-w-6xl space-y-8 p-4 sm:p-6 lg:p-8">
      <header>
        <p className="mb-1 text-sm font-medium text-primary">การดูแลสมาชิก</p>
        <h1 className="text-balance text-2xl font-bold sm:text-3xl">ระบบแจ้งเตือน</h1>
        <p className="mt-1 max-w-3xl text-pretty text-sm text-muted-foreground">
          ตั้งค่าแจ้งเตือนก่อนหมดอายุ ติดตามสมาชิกที่ไม่ได้เข้าใช้บริการ และตรวจสอบคิว SMS, LINE OA, อีเมล และข้อความในระบบ
        </p>
      </header>
      <NotificationManager
        settings={{
          reminderDays: settings.reminderDays,
          inactivityDays: settings.inactivityDays,
          enableInApp: settings.enableInApp,
          enableSms: settings.enableSms,
          enableLine: settings.enableLine,
          enableEmail: settings.enableEmail,
          isActive: settings.isActive,
        }}
        history={history.map((item) => ({
          ...item,
          scheduledFor: item.scheduledFor.toISOString().slice(0, 10),
          createdAt: item.createdAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
