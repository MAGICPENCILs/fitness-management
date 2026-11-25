"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** เพิ่มจุดในสาขาที่เซิร์ฟเวอร์เลือก โดยใช้รายการจากฐานเป็นแหล่งข้อมูลหลัก */
export function AccessScanPointForm({ points }: { points: { id: number; name: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);

  /** คงค่าที่กรอกเมื่อบันทึกไม่สำเร็จ และอ่านรายการใหม่หลังเซิร์ฟเวอร์ยืนยัน */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !name.trim()) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/access-scan-points", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "เพิ่มจุดสแกนไม่สำเร็จ กรุณาลองอีกครั้ง");
      }
      setName("");
      setFeedback({ error: false, message: "เพิ่มจุดสแกนแล้ว" });
      router.refresh();
    } catch (error) {
      setFeedback({ error: true, message: error instanceof Error ? error.message : "เพิ่มจุดสแกนไม่สำเร็จ" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="scan-points-title" className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      <div>
        <h2 id="scan-points-title" className="text-lg font-semibold">จุดสแกนในสาขานี้</h2>
        <p className="mt-1 text-sm text-muted-foreground">ใช้แยกประวัติการสแกนตามตำแหน่ง ยังไม่เชื่อมกับเครื่องอ่านหรือประตู</p>
      </div>
      {points.length ? <ul className="divide-y rounded-lg border">{points.map(point => <li key={point.id} className="break-words px-3 py-2 text-sm">{point.name}</li>)}</ul>
        : <p className="text-sm text-muted-foreground">ยังไม่มีจุดสแกน</p>}
      <form onSubmit={submit} aria-busy={saving} className="space-y-2">
        <Label htmlFor="new-scan-point">ชื่อจุดสแกน</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input id="new-scan-point" value={name} maxLength={80} required readOnly={saving} placeholder="เช่น ห้องโยคะ"
            aria-invalid={feedback?.error || undefined} aria-describedby={feedback?.error ? "scan-point-save-feedback" : undefined}
            onChange={event => { setName(event.target.value); setFeedback(null); }} />
          <Button type="submit" disabled={saving || !name.trim()}>{saving ? "กำลังเพิ่มจุด…" : "เพิ่มจุดสแกน"}</Button>
        </div>
        {feedback ? <p id="scan-point-save-feedback" role={feedback.error ? "alert" : "status"} className={feedback.error ? "text-sm text-destructive" : "text-sm text-success"}>{feedback.message}</p> : null}
      </form>
    </section>
  );
}
