import {
  Activity,
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock3,
  CircleOff,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { EquipmentDashboardDto } from "@/lib/equipment-service";

const toneClasses = {
  primary: "border-primary/20 before:bg-primary bg-card",
  info: "border-info/20 before:bg-info bg-card",
  success: "border-success/20 before:bg-success bg-card",
  warning: "border-warning/25 before:bg-warning bg-card",
  destructive: "border-destructive/20 before:bg-destructive bg-card",
} as const;

/** แสดงตัวเลขสรุปพร้อมข้อความและไอคอน เพื่อไม่ใช้สีเป็นตัวบอกสถานะเพียงอย่างเดียว */
function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: keyof typeof toneClasses;
}) {
  return (
    <article
      className={`relative overflow-hidden rounded-xl border p-4 shadow-sm before:absolute before:inset-x-0 before:top-0 before:h-1 ${toneClasses[tone]}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold tabular-nums text-card-foreground">
          {label} {value.toLocaleString("th-TH")} เครื่อง
        </p>
        <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
    </article>
  );
}
export function EquipmentSummary({
  summary,
}: {
  summary: EquipmentDashboardDto["summary"];
}) {
  const cards = [
    { label: "อุปกรณ์ทั้งหมด", value: summary.total, icon: Activity, tone: "info" },
    { label: "พร้อมใช้งาน", value: summary.operational, icon: CheckCircle2, tone: "success" },
    { label: "อยู่ระหว่างบำรุง", value: summary.maintenance, icon: Wrench, tone: "warning" },
    { label: "หยุดใช้งานชั่วคราว", value: summary.outOfService, icon: CircleOff, tone: "destructive" },
    { label: "เลิกใช้งาน", value: summary.retired, icon: Archive, tone: "primary" },
    { label: "เกินกำหนด", value: summary.overdue, icon: AlertTriangle, tone: "destructive" },
    { label: "ใกล้ถึงกำหนด", value: summary.dueSoon, icon: Clock3, tone: "warning" },
  ] satisfies Array<{
    label: string;
    value: number;
    icon: LucideIcon;
    tone: keyof typeof toneClasses;
  }>;

  return (
    <section aria-labelledby="equipment-summary-heading" className="space-y-3">
      <div>
        <h2 id="equipment-summary-heading" className="text-lg font-semibold">
          ภาพรวมทั้งสาขา
        </h2>
        <p className="text-sm text-muted-foreground">
          ตัวเลขสรุปไม่เปลี่ยนตามตัวกรองของรายการด้านล่าง
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <SummaryCard key={card.label} {...card} />
        ))}
      </div>
    </section>
  );
}
