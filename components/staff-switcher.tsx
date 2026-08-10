"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StaffRole } from "@/lib/rbac";

const ROLE_LABELS: Record<StaffRole, string> = {
  OWNER: "เจ้าของระบบ",
  MANAGER: "ผู้จัดการ",
  COUNTER: "เคาน์เตอร์",
  TRAINER: "เทรนเนอร์",
};

type StaffOption = {
  id: number;
  staffCode: string;
  displayName: string;
  role: StaffRole;
  branchName: string;
};

/** สลับ temporary staff context ผ่าน Route Handler แล้ว refresh Server Components */
export function StaffSwitcher({
  staff,
  currentStaffId,
}: {
  staff: StaffOption[];
  currentStaffId: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  /** บันทึกพนักงานที่เลือกพร้อมแสดงสถานะระหว่างรอและแนวทางเมื่อเกิดข้อผิดพลาด */
  async function handleStaffChange(value: string) {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/staff/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: Number(value) }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error ?? "ไม่สามารถเปลี่ยนบัญชีพนักงานได้");
      router.refresh();
    } catch (changeError) {
      setError(
        changeError instanceof Error
          ? `${changeError.message} กรุณาลองอีกครั้ง`
          : "ไม่สามารถเปลี่ยนบัญชีพนักงานได้ กรุณาลองอีกครั้ง",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold text-muted-foreground" htmlFor="staff-context">
        บัญชีพนักงานปัจจุบัน
      </label>
      <Select
        value={String(currentStaffId)}
        onValueChange={handleStaffChange}
        disabled={pending}
      >
        <SelectTrigger
          id="staff-context"
          className="w-full bg-background"
          aria-label="เลือกบัญชีพนักงานปัจจุบัน"
        >
          <ShieldCheck aria-hidden="true" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" className="max-w-[calc(100vw-2rem)]">
          <SelectGroup>
            {staff.map((item) => (
              <SelectItem key={item.id} value={String(item.id)}>
                <span className="flex min-w-0 flex-col items-start">
                  <span className="max-w-56 truncate font-medium">
                    {item.displayName} ({item.staffCode})
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {ROLE_LABELS[item.role]} · {item.branchName}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <p
        aria-live="polite"
        className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
      >
        {pending
          ? "กำลังเปลี่ยนบัญชีพนักงาน..."
          : error || "ใช้สำหรับทดสอบสิทธิ์ชั่วคราวก่อนมีหน้าเข้าสู่ระบบ"}
      </p>
    </div>
  );
}
