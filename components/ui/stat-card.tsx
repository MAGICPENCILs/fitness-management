import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const toneStyles = {
  primary: "border-primary/20 before:bg-primary [&_.stat-icon]:bg-accent [&_.stat-icon]:text-accent-foreground",
  info: "border-info/20 before:bg-info [&_.stat-icon]:bg-info-surface [&_.stat-icon]:text-info",
  success: "border-success/20 before:bg-success [&_.stat-icon]:bg-success-surface [&_.stat-icon]:text-success",
  warning: "border-warning/25 before:bg-warning [&_.stat-icon]:bg-warning-surface [&_.stat-icon]:text-warning-foreground",
  destructive: "border-destructive/20 before:bg-destructive [&_.stat-icon]:bg-destructive/10 [&_.stat-icon]:text-destructive",
} as const;

/** แสดงตัวเลขสำคัญด้วยสีตามบทบาท โดยยังคงมีข้อความและไอคอนเป็นตัวบอกความหมายร่วมกัน */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone?: keyof typeof toneStyles;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card p-5 shadow-sm before:absolute before:inset-x-0 before:top-0 before:h-1",
        toneStyles[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-xl font-bold tabular-nums text-card-foreground sm:text-2xl">{value}</p>
        </div>
        <span className="stat-icon flex size-11 shrink-0 items-center justify-center rounded-lg">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
    </article>
  );
}
