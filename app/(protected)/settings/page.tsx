import Link from "next/link";
import { Bell, Building2, ChevronRight, Database, DoorOpen, ReceiptText, ScrollText, ShieldCheck, Tag, UserCog, UsersRound } from "lucide-react";

const settings = [
  {
    title: "เวลาและค่าตอบแทน",
    description: "ลงเวลา เงินเดือนฐาน commission และ payroll แบบอนุมัติ manual",
    href: "/settings/workforce",
    icon: UsersRound,
    status: "พร้อมใช้งาน",
    tone: "bg-info-surface text-info",
  },
  {
    title: "ใบเสร็จและภาษี",
    description: "กำหนดข้อมูลนิติบุคคล เลขผู้เสียภาษี และ VAT แยกตามสาขา",
    href: "/settings/receipts",
    icon: ReceiptText,
    status: "พร้อมใช้งาน",
    tone: "bg-success-surface text-success",
  },
  {
    title: "บัญชีพนักงาน",
    description: "จัดการบัญชี บทบาท สถานะ และขอบเขตสาขา",
    href: "/settings/staff",
    icon: UserCog,
    status: "พร้อมใช้งาน",
    tone: "bg-info-surface text-info",
  },
  {
    title: "PDPA และคำขอ",
    description: "ติดตาม consent, anonymization และงานลบไฟล์ที่ค้าง",
    href: "/settings/privacy",
    icon: ShieldCheck,
    status: "พร้อมใช้งาน",
    tone: "bg-success-surface text-success",
  },
  {
    title: "Audit log",
    description: "ตรวจสอบผู้ดำเนินการ ผลลัพธ์ และ metadata ที่ไม่มี PII",
    href: "/settings/audit",
    icon: ScrollText,
    status: "พร้อมใช้งาน",
    tone: "bg-warning-surface text-warning-foreground",
  },
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
  {
    title: "สาขา",
    description: "จัดการข้อมูลสาขา เวลาเปิดให้บริการ และสถานะการใช้งาน",
    href: "/settings/branches",
    icon: Building2,
    status: "พร้อมใช้งาน",
    tone: "bg-info-surface text-info",
  },
];

const operatorTools = [
  {
    title: "สำรองและกู้คืนข้อมูล",
    description: "เข้ารหัส ตรวจ checksum และกู้คืนผ่าน Operator CLI ตาม runbook เท่านั้น",
    icon: Database,
  },
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

      <section aria-labelledby="operator-tools-heading">
        <h2 id="operator-tools-heading" className="mb-3 text-lg font-semibold">เครื่องมือระดับระบบ</h2>
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {operatorTools.map((setting) => {
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
                <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">ใช้ผ่าน CLI</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
