"use client";

import { useState } from "react";
import { Building2, LogOut, ShieldCheck, UserRoundCheck } from "lucide-react";
import { useRouter } from "next/navigation";

import { readAuthClientResponse } from "@/components/auth/auth-client-response";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StaffRole } from "@/lib/rbac";

const ROLE_LABELS: Record<StaffRole, string> = {
  OWNER: "เจ้าของระบบ",
  MANAGER: "ผู้จัดการ",
  COUNTER: "เคาน์เตอร์",
  TRAINER: "เทรนเนอร์",
};

export type CurrentStaffSummary = {
  staffCode: string;
  displayName: string;
  role: StaffRole;
  branchName: string;
};

const LOGOUT_UNAVAILABLE_MESSAGE = "ไม่สามารถออกจากระบบได้ชั่วคราว";

/** Revoke session ผ่าน Route Handler ก่อนนำผู้ใช้กลับหน้า Login และคง error ไว้บนหน้าเพื่อให้ลองใหม่ได้ */
export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  /** ป้องกันการส่ง Logout ซ้ำระหว่างรอ และไม่เปลี่ยนหน้าเมื่อ server ยัง revoke ไม่สำเร็จ */
  async function handleLogout() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const result = await readAuthClientResponse(response);
      if (!response.ok || !result) {
        setError(result?.error ?? LOGOUT_UNAVAILABLE_MESSAGE);
        setPending(false);
        return;
      }
      router.replace("/login");
    } catch {
      setError(LOGOUT_UNAVAILABLE_MESSAGE);
      setPending(false);
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start"
        disabled={pending}
        aria-busy={pending}
        onClick={handleLogout}
      >
        <LogOut className="size-4" aria-hidden="true" />
        {pending ? "กำลังออกจากระบบ" : "ออกจากระบบ"}
      </Button>
      <p
        role="status"
        aria-live="polite"
        className={error ? "text-xs leading-5 text-destructive" : "sr-only"}
      >
        {error ? `${error} กรุณาลองอีกครั้ง` : ""}
      </p>
    </div>
  );
}

/** แสดงตัวตนจาก authoritative session โดยไม่ใช้รายชื่อ Staff เป็นตัวเลือกใน runtime ปกติ */
export function CurrentStaffMenu({ staff }: { staff: CurrentStaffSummary }) {
  return (
    <section aria-label="บัญชีผู้ใช้ปัจจุบัน" className="space-y-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <UserRoundCheck className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {staff.displayName}
          </p>
          <p className="text-xs font-medium text-muted-foreground">
            {staff.staffCode}
          </p>
        </div>
      </div>
      <dl className="grid gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
          <dt className="sr-only">บทบาท</dt>
          <dd>{ROLE_LABELS[staff.role]}</dd>
        </div>
        <div className="flex items-center gap-2">
          <Building2 className="size-4 shrink-0" aria-hidden="true" />
          <dt className="sr-only">สาขา</dt>
          <dd className="truncate">{staff.branchName}</dd>
        </div>
      </dl>
      <LogoutButton />
    </section>
  );
}
