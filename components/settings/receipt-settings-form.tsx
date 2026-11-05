"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Settings = {
  legalName: string;
  taxId: string | null;
  branchNumber: string;
  address: string;
  phone: string | null;
  vatRegistered: boolean;
  vatRate: string;
} | null;

/** จัดการค่าผู้ออกเอกสารของสาขาปัจจุบัน พร้อม feedback ที่อ่านได้ด้วย screen reader */
export function ReceiptSettingsForm({ settings }: { settings: Settings }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [vatRegistered, setVatRegistered] = useState(settings?.vatRegistered ?? false);

  /** ส่งค่าจากฟอร์มให้ API ตรวจซ้ำ โดยไม่ส่ง branch id จากฝั่งผู้ใช้ */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/receipt-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legalName: data.get("legalName"),
          taxId: data.get("taxId") || undefined,
          branchNumber: data.get("branchNumber"),
          address: data.get("address"),
          phone: data.get("phone") || undefined,
          vatRegistered,
          vatRate: data.get("vatRate"),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "บันทึกไม่สำเร็จ");
      setSaved(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "บันทึกไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="legal-name">ชื่อนิติบุคคล *</Label>
          <Input id="legal-name" name="legalName" defaultValue={settings?.legalName ?? ""} minLength={2} maxLength={200} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tax-id">เลขประจำตัวผู้เสียภาษี</Label>
          <Input id="tax-id" name="taxId" defaultValue={settings?.taxId ?? ""} inputMode="numeric" pattern="[0-9]{13}" maxLength={13} required={vatRegistered} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="branch-number">เลขสาขา *</Label>
          <Input id="branch-number" name="branchNumber" defaultValue={settings?.branchNumber ?? "00000"} inputMode="numeric" pattern="[0-9]{5}" maxLength={5} required />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="receipt-address">ที่อยู่บนเอกสาร *</Label>
          <Input id="receipt-address" name="address" defaultValue={settings?.address ?? ""} minLength={5} maxLength={1000} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="receipt-phone">โทรศัพท์</Label>
          <Input id="receipt-phone" name="phone" type="tel" defaultValue={settings?.phone ?? ""} maxLength={20} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vat-rate">อัตรา VAT (%) *</Label>
          <Input id="vat-rate" name="vatRate" defaultValue={settings?.vatRate ?? "7.00"} inputMode="decimal" pattern="[0-9]{1,2}([.][0-9]{1,2})?" required />
        </div>
      </div>

      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
        <input type="checkbox" checked={vatRegistered} onChange={(event) => setVatRegistered(event.target.checked)} className="size-4 accent-primary" />
        <span><span className="block text-sm font-medium">จดทะเบียนภาษีมูลค่าเพิ่ม</span><span className="block text-xs text-muted-foreground">เมื่อเปิดใช้ ระบบจะแยก VAT จากยอดรวมและอนุญาตให้ออกใบกำกับภาษี</span></span>
      </label>

      {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      {saved ? <p aria-live="polite" className="flex items-center gap-2 rounded-lg border border-success/30 bg-success-surface p-3 text-sm text-success"><CheckCircle2 className="size-4" aria-hidden="true" />บันทึกการตั้งค่าแล้ว</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
        {pending ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
      </Button>
    </form>
  );
}
