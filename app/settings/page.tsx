import Link from "next/link";
import { Bell, Building2, ChevronRight, Database, DoorOpen, ShieldCheck, Tag } from "lucide-react";

const settings = [
  {
    title: "โปรโมชัน",
    description: "จัดการส่วนลด เปอร์เซ็นต์ และวันใช้งานโบนัส",
    href: "/settings/promotions",
    icon: Tag,
    status: "พร้อมใช้งาน",
    tone: "bg-warning-surface text-warning-foreground",
  },
  {
    title: "การแจ้งเตือน",
    description: "กำหนดวันเตือนก่อนหมดอายุ สมาชิกขาดการใช้งาน และช่องทางส่งข้อความ",
    href: "/settings/notifications",
    icon: Bell,
    status: "พร้อมใช้งาน",
    tone: "bg-info-surface text-info",
  },
  {
    title: "จุดสแกนและประตู",
    description: "ตรวจสอบการสแกนบัตรและสถานะการเข้าใช้บริการ",
    href: "/access",
    icon: DoorOpen,
    status: "พร้อมใช้งาน",
    tone: "bg-success-surface text-success",
  },
];

const upcoming = [
  { title: "สาขา", description: "ข้อมูลสาขาและเวลาเปิดให้บริการ", icon: Building2 },
  { title: "สิทธิ์พนักงาน", description: "บทบาท การอนุมัติ และ Audit log", icon: ShieldCheck },
  { title: "สำรองข้อมูล", description: "รอบสำรองข้อมูลและการกู้คืน", icon: Database },
];

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-4 sm:p-6 lg:p-8">
      <header>
        <p className="mb-1 text-sm font-medium text-primary">การดูแลระบบ</p>
        <h1 className="text-balance text-2xl font-bold sm:text-3xl">ตั้งค่าระบบ</h1>
        <p className="mt-1 text-pretty text-sm text-muted-foreground">
          จัดการค่าการทำงานที่เปิดใช้งานแล้ว และดูรายการที่จะพัฒนาในระยะถัดไป
        </p>
      </header>

      <section aria-labelledby="available-settings-heading">
        <h2 id="available-settings-heading" className="mb-3 text-lg font-semibold">พร้อมตั้งค่า</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {settings.map((setting) => {
            const Icon = setting.icon;
            return (
              <Link
                key={setting.title}
                href={setting.href}
                className="group flex min-h-32 items-start gap-4 rounded-xl border bg-card p-5 shadow-sm transition-colors duration-150 hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${setting.tone}`}>
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{setting.title}</span>
                  <span className="mt-1 block text-pretty text-sm text-muted-foreground">{setting.description}</span>
                  <span className="mt-3 block text-xs font-medium text-primary">{setting.status}</span>
                </span>
                <ChevronRight className="mt-2 size-5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="upcoming-settings-heading">
        <h2 id="upcoming-settings-heading" className="mb-3 text-lg font-semibold">แผนระยะถัดไป</h2>
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {upcoming.map((setting) => {
            const Icon = setting.icon;
            return (
              <div key={setting.title} className="flex items-center gap-4 p-4 sm:p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">{setting.title}</h3>
                  <p className="text-pretty text-sm text-muted-foreground">{setting.description}</p>
                </div>
                <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">เร็ว ๆ นี้</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
