"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CreditCard,
  DoorOpen,
  Dumbbell,
  LayoutDashboard,
  Menu,
  Settings,
  Tag,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const menuItems = [
  { href: "/", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/members", label: "สมาชิก", icon: Users },
  { href: "/payments", label: "ชำระเงิน", icon: CreditCard },
  { href: "/access", label: "เข้าใช้บริการ", icon: DoorOpen },
  { href: "/reports", label: "รายงาน", icon: BarChart3 },
  { href: "/settings/promotions", label: "โปรโมชัน", icon: Tag },
  { href: "/settings", label: "ตั้งค่าระบบ", icon: Settings },
];

function Brand() {
  return (
    <Link href="/" className="flex min-h-11 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Dumbbell className="size-5" aria-hidden="true" />
      </span>
      <span>
        <span className="block text-sm font-bold text-foreground">Fitness Pro</span>
        <span className="block text-xs text-muted-foreground">Management System</span>
      </span>
    </Link>
  );
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="เมนูหลัก" className="space-y-1">
      {menuItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              isActive && "bg-accent text-accent-foreground",
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
            {isActive && <span className="ml-auto size-2 rounded-full bg-primary" aria-hidden="true" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between border-b bg-card px-4 md:hidden">
        <Brand />
        <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon" className="size-11" aria-label="เปิดเมนูหลัก">
              <Menu className="size-5" aria-hidden="true" />
            </Button>
          </DialogTrigger>
          <DialogContent className="top-4 bottom-4 left-4 flex w-[min(22rem,calc(100%-2rem))] max-w-none translate-x-0 translate-y-0 flex-col p-5 sm:max-w-none">
            <DialogHeader className="pr-10 text-left">
              <DialogTitle>เมนูหลัก</DialogTitle>
              <DialogDescription>เลือกส่วนงานที่ต้องการจัดการ</DialogDescription>
            </DialogHeader>
            <div className="mt-2 border-t pt-4">
              <Navigation onNavigate={() => setMobileOpen(false)} />
            </div>
          </DialogContent>
        </Dialog>
      </header>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-card md:flex">
        <div className="border-b p-5">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <p className="px-3 pb-2 pt-1 text-xs font-semibold text-muted-foreground">เมนูหลัก</p>
          <Navigation />
        </div>
        <div className="border-t p-4 text-center text-xs text-muted-foreground">Fitness Pro v1.0.0</div>
      </aside>
    </>
  );
}
