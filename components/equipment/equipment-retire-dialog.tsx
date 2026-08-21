"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Archive, Loader2, TriangleAlert } from "lucide-react";
import { retireEquipmentSchema } from "@/lib/equipment-core";
import type { EquipmentDto } from "@/lib/equipment-service";
import { sendEquipmentMutation } from "@/components/equipment/equipment-client-response";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

/** ยืนยัน lifecycle ปลายทางด้วยเหตุผลและคำอธิบายผลกระทบที่ไม่พึ่งสีเพียงอย่างเดียว */
export function EquipmentRetireDialog({ item, onSuccess }: { item: EquipmentDto; onSuccess: (message: string) => void }) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  /** ไม่ยอม dismiss ระหว่าง pending เพื่อไม่ทำให้ผลของคำสั่งถาวรคลุมเครือ */
  function changeOpen(next: boolean) {
    if (!pending) {
      setOpen(next);
      if (!next) setError("");
    }
  }

  /** บังคับเหตุผลที่ตรวจแล้วและ version ปัจจุบันก่อนเปลี่ยน lifecycle แบบย้อนกลับไม่ได้ */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const parsed = retireEquipmentSchema.safeParse({ reason: data.get("reason"), expectedVersion: item.version });
    if (!parsed.success) {
      setError("กรุณาระบุเหตุผลอย่างน้อย 2 ตัวอักษร");
      return;
    }
    setError("");
    setPending(true);
    const result = await sendEquipmentMutation({ url: `/api/equipment/${item.id}/retire`, method: "POST", body: parsed.data, flow: "retire" });
    setPending(false);
    if (result.kind === "success") {
      setOpen(false);
      onSuccess("เลิกใช้งานอุปกรณ์เรียบร้อยแล้ว");
      router.refresh();
    } else if (result.kind === "stale") {
      setOpen(false);
      onSuccess("ข้อมูลถูกแก้ไขแล้ว กรุณาตรวจสอบข้อมูลล่าสุด");
      router.refresh();
    } else if (result.kind === "error") setError(result.message);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild><Button ref={triggerRef} type="button" variant="destructive" className="min-h-11"><Archive aria-hidden="true" /><span className="sr-only">เลิกใช้งาน {item.code}</span></Button></DialogTrigger>
      <DialogContent className="sm:max-w-lg [&_[data-slot=dialog-close]]:size-11" aria-busy={pending} onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }}>
        <DialogHeader><DialogTitle>เลิกใช้งาน {item.code}</DialogTitle><DialogDescription>การเปลี่ยนแปลงนี้เป็น lifecycle ปลายทางและไม่สามารถย้อนกลับจากหน้านี้ได้</DialogDescription></DialogHeader>
        <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm"><TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" /><p>อุปกรณ์จะไม่สามารถนำกลับมาใช้งานหรือบันทึกงานบำรุงต่อได้ แต่ประวัติเดิมยังคงอยู่</p></div>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2"><Label htmlFor={`retire-reason-${item.id}`}>เหตุผลที่เลิกใช้งาน</Label><textarea id={`retire-reason-${item.id}`} name="reason" required minLength={2} maxLength={500} disabled={pending} aria-invalid={error ? true : undefined} aria-describedby={error ? `retire-error-${item.id}` : `retire-help-${item.id}`} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50" /><p id={`retire-help-${item.id}`} className="text-sm text-muted-foreground">ระบุสาเหตุเพื่อเก็บเป็นหลักฐานของการเลิกใช้งาน</p>{error && <p id={`retire-error-${item.id}`} role="alert" className="text-sm text-destructive">{error}</p>}</div>
          <DialogFooter><Button type="button" variant="outline" className="min-h-11" onClick={() => changeOpen(false)} disabled={pending}>ยกเลิก</Button><Button type="submit" variant="destructive" className="min-h-11" disabled={pending}>{pending && <Loader2 className="animate-spin" aria-hidden="true" />}ยืนยันเลิกใช้งาน</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
