"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** สลับ branch context ผ่าน route handler แล้ว refresh Server Components ทุกหน้าด้วย cookie ใหม่ */
export function BranchSwitcher({
  branches,
  currentBranchId,
}: {
  branches: Array<{ id: number; code: string; name: string }>;
  currentBranchId: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  /** บันทึกสาขาที่เลือกและคงหน้าเดิมไว้เพื่อให้ผู้ใช้ทำงานต่อเนื่อง */
  async function handleBranchChange(value: string) {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/branches/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId: Number(value) }),
      });
      if (!response.ok) throw new Error("ไม่สามารถเปลี่ยนสาขาได้");
      router.refresh();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "ไม่สามารถเปลี่ยนสาขาได้");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold text-muted-foreground" htmlFor="branch-context">
        สาขาที่กำลังทำงาน
      </label>
      <Select
        value={String(currentBranchId)}
        onValueChange={handleBranchChange}
        disabled={pending}
      >
        <SelectTrigger id="branch-context" className="w-full bg-background" aria-label="เลือกสาขาที่กำลังทำงาน">
          <Building2 aria-hidden="true" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {branches.map((branch) => (
              <SelectItem key={branch.id} value={String(branch.id)}>
                {branch.name} ({branch.code})
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <p aria-live="polite" className="text-xs text-muted-foreground">
        {pending ? "กำลังเปลี่ยนสาขา..." : error || "ข้อมูลรายการและรายงานจะอิงสาขานี้"}
      </p>
    </div>
  );
}
