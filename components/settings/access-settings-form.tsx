"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** ให้ผู้ดูแลปรับ Grace Period ภายในช่วงธุรกิจ 3–7 วันและแสดงผลบันทึกใกล้ฟอร์ม */
export function AccessSettingsForm({ initialGraceDays }: { initialGraceDays: number }) {
  const router = useRouter();
  const [graceDays, setGraceDays] = useState(initialGraceDays);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  /** ส่งเฉพาะค่ากฎที่แก้ไข และใช้ผลจาก server เป็นค่าปัจจุบัน */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/access-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graceDays }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "ไม่สามารถบันทึกการตั้งค่าได้");
      setGraceDays(result.settings.graceDays);
      setFeedback({ type: "success", message: result.message });
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "ไม่สามารถบันทึกการตั้งค่าได้" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-6 rounded-xl border bg-card p-4 shadow-sm sm:p-6" onSubmit={handleSubmit}>
      <div className="space-y-1.5">
        <Label htmlFor="access-grace-days">Grace Period หลังหมดอายุ (วัน)</Label>
        <Input id="access-grace-days" type="number" inputMode="numeric" min={3} max={7} value={graceDays} onChange={(event) => setGraceDays(Number(event.target.value))} required />
        <p className="text-sm text-muted-foreground">สมาชิกยังเข้าได้พร้อมคำเตือนทุกครั้ง เลือกได้ตั้งแต่ 3 ถึง 7 วัน</p>
      </div>
      <Button type="submit" disabled={saving}>
        {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
        บันทึกการตั้งค่า
      </Button>
      {feedback ? <p role={feedback.type === "error" ? "alert" : "status"} className={feedback.type === "error" ? "text-sm text-destructive" : "text-sm text-primary"}>{feedback.message}</p> : null}
    </form>
  );
}
