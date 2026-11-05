"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Clock3, Loader2, MessageSquareText, RefreshCw, Save, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatCard } from "@/components/ui/stat-card";

type NotificationSettingsForm = {
  reminderDays: string;
  inactivityDays: number;
  enableInApp: boolean;
  enableSms: boolean;
  enableLine: boolean;
  enableEmail: boolean;
  isActive: boolean;
};

type NotificationHistory = {
  id: number;
  memberId: number;
  memberCode: string;
  memberName: string;
  memberLastName: string;
  type: "EXPIRY_REMINDER" | "INACTIVITY" | "SCAN_WARNING";
  channel: "IN_APP" | "SMS" | "LINE" | "EMAIL";
  status: "QUEUED" | "PROCESSING" | "SENT" | "FAILED" | "SKIPPED";
  title: string;
  message: string;
  scheduledFor: string;
  errorMessage: string | null;
  failureKind: "RETRYABLE" | "PERMANENT" | "CONFIG" | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  createdAt: string | null;
};

const channelOptions = [
  { key: "enableInApp", label: "ภายในระบบ", description: "แสดงและบันทึกข้อความในระบบทันที" },
  { key: "enableSms", label: "SMS", description: "ส่งผ่าน webhook ที่ผู้ดูแลระบบกำหนด" },
  { key: "enableLine", label: "LINE OA", description: "ยังไม่พร้อมใช้: ระบบยังไม่มี LINE User ID ของสมาชิก", disabled: true },
  { key: "enableEmail", label: "อีเมล", description: "ส่งผ่าน SMTP แบบ TLS" },
] as const;

const typeLabel = {
  EXPIRY_REMINDER: "ใกล้หมดอายุ",
  INACTIVITY: "ขาดการใช้งาน",
  SCAN_WARNING: "เตือนจุดสแกน",
} as const;

const channelLabel = { IN_APP: "ในระบบ", SMS: "SMS", LINE: "LINE OA", EMAIL: "อีเมล" } as const;
const statusLabel = { QUEUED: "รอส่ง", PROCESSING: "กำลังส่ง", SENT: "ส่งแล้ว", FAILED: "ส่งไม่สำเร็จ", SKIPPED: "ข้าม" } as const;

type ProviderHealth = {
  mode: "disabled" | "simulate" | "live";
  inApp: "READY";
  sms: "READY" | "DISABLED";
  line: "UNAVAILABLE";
  email: "READY" | "DISABLED";
};

/** แสดงค่าตั้ง ช่องทาง สถิติ และประวัติของ Notification Engine ในหน้าเดียว */
export function NotificationManager({
  settings,
  history,
  providerHealth,
}: {
  settings: NotificationSettingsForm;
  history: NotificationHistory[];
  providerHealth: ProviderHealth;
}) {
  const router = useRouter();
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const stats = useMemo(() => ({
    total: history.length,
    sent: history.filter((item) => item.status === "SENT").length,
    queued: history.filter((item) => item.status === "QUEUED" || item.status === "PROCESSING").length,
    attention: history.filter((item) => item.status === "FAILED" || item.status === "SKIPPED").length,
  }), [history]);

  /** อัปเดตค่าฟอร์มเฉพาะช่องที่ผู้ดูแลแก้ไข */
  const updateForm = <Key extends keyof NotificationSettingsForm>(key: Key, value: NotificationSettingsForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFeedback(null);
  };

  /** ส่งรายการที่รอหรือ retry ได้ผ่าน provider โดยสรุปเฉพาะจำนวนและไม่แสดงข้อมูลผู้รับ */
  const handleDeliver = async () => {
    setDelivering(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/notifications/deliver", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "ไม่สามารถส่งคิวได้");
      setFeedback({ type: "success", message: `ประมวลผล ${result.processed} รายการ · ส่งสำเร็จ ${result.sent} รายการ` });
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "ไม่สามารถส่งคิวได้" });
    } finally {
      setDelivering(false);
    }
  };

  /** retry เฉพาะรายการที่ service ยืนยันว่าเป็นความล้มเหลวชั่วคราวหรือ config ที่แก้แล้ว */
  const handleRetry = async (notificationId: number) => {
    setRetryingId(notificationId);
    setFeedback(null);
    try {
      const response = await fetch(`/api/notifications/${notificationId}/retry`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "ไม่สามารถส่งซ้ำได้");
      setFeedback({ type: "success", message: "ประมวลผลรายการซ้ำแล้ว" });
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "ไม่สามารถส่งซ้ำได้" });
    } finally {
      setRetryingId(null);
    }
  };

  /** บันทึกค่าตั้งและใช้ผลที่เซิร์ฟเวอร์จัดรูปแบบแล้วเป็นค่าปัจจุบัน */
  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/notification-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "ไม่สามารถบันทึกการตั้งค่าได้");
      setForm((current) => ({ ...current, ...result.settings }));
      setFeedback({ type: "success", message: result.message });
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "ไม่สามารถบันทึกการตั้งค่าได้" });
    } finally {
      setSaving(false);
    }
  };

  /** สั่งประมวลผลรอบปัจจุบันและรีเฟรชประวัติเมื่อสร้างรายการเสร็จ */
  const handleGenerate = async () => {
    setGenerating(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/notifications/generate", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "ไม่สามารถประมวลผลการแจ้งเตือนได้");
      setFeedback({ type: "success", message: `${result.message} (${result.created} รายการใหม่)` });
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "ไม่สามารถประมวลผลการแจ้งเตือนได้" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="สรุปการแจ้งเตือนล่าสุด">
        {[
          { label: "ประวัติล่าสุด", value: stats.total, icon: BellRing, tone: "primary" as const },
          { label: "แสดงในระบบแล้ว", value: stats.sent, icon: MessageSquareText, tone: "success" as const },
          { label: "รอผู้ให้บริการ", value: stats.queued, icon: Clock3, tone: "warning" as const },
          { label: "ต้องตรวจสอบ", value: stats.attention, icon: RefreshCw, tone: "destructive" as const },
        ].map((item) => <StatCard key={item.label} {...item} className="p-4" />)}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.75fr)]">
        <form className="space-y-6 rounded-xl border bg-card p-4 shadow-sm sm:p-6" onSubmit={handleSave}>
          <div>
            <h2 className="text-lg font-semibold">กฎการแจ้งเตือน</h2>
            <p className="text-sm text-muted-foreground">ระบบจะไม่สร้างข้อความเดิมซ้ำให้สมาชิกในรอบเดียวกัน</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="reminder-days">เตือนก่อนหมดอายุ (วัน)</Label>
              <Input id="reminder-days" value={form.reminderDays} onChange={(event) => updateForm("reminderDays", event.target.value)} placeholder="7,3,1" inputMode="numeric" required />
              <p className="text-xs text-muted-foreground">คั่นหลายค่าด้วยเครื่องหมายจุลภาค เช่น 7,3,1</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inactivity-days">ไม่ได้เข้าใช้บริการเกิน (วัน)</Label>
              <Input id="inactivity-days" type="number" min={1} max={365} value={form.inactivityDays} onChange={(event) => updateForm("inactivityDays", Number(event.target.value))} required />
              <p className="text-xs text-muted-foreground">ใช้วันเข้าใช้บริการล่าสุดหรือวันที่สมัครเป็นจุดเริ่มต้น</p>
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="font-medium">ช่องทางแจ้งเตือน</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {channelOptions.map((channel) => (
                <label key={channel.key} className="flex min-h-20 cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/50">
                  <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary" checked={form[channel.key]} disabled={"disabled" in channel && channel.disabled} onChange={(event) => updateForm(channel.key, event.target.checked)} />
                  <span>
                    <span className="block text-sm font-medium">{channel.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{channel.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-lg border p-3">
            <span>
              <span className="block text-sm font-medium">เปิด Notification Engine</span>
              <span className="block text-xs text-muted-foreground">เมื่อปิด ระบบจะหยุดสร้างรายการใหม่แต่ยังเก็บประวัติเดิม</span>
            </span>
            <input type="checkbox" className="size-5 shrink-0 accent-primary" checked={form.isActive} onChange={(event) => updateForm("isActive", event.target.checked)} />
          </label>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" disabled={saving} className="sm:min-w-40">
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
              บันทึกการตั้งค่า
            </Button>
            <Button type="button" variant="outline" disabled={generating || !form.isActive} onClick={handleGenerate}>
              {generating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
              ประมวลผลตอนนี้
            </Button>
            <Button type="button" variant="outline" disabled={delivering} onClick={handleDeliver}>
              {delivering ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
              ส่งคิวตอนนี้
            </Button>
          </div>
          {feedback ? (
            <p className={feedback.type === "error" ? "text-sm text-destructive" : "text-sm text-primary"} role={feedback.type === "error" ? "alert" : "status"}>{feedback.message}</p>
          ) : null}
        </form>

        <aside className="rounded-xl border bg-card p-4 shadow-sm sm:p-6" aria-labelledby="delivery-status-heading">
          <h2 id="delivery-status-heading" className="text-lg font-semibold">สถานะการเชื่อมต่อ</h2>
          <div className="mt-4 space-y-4 text-sm">
            <div className="rounded-lg bg-muted/50 p-3"><p className="font-medium">โหมด {providerHealth.mode === "live" ? "ส่งจริง" : providerHealth.mode === "simulate" ? "จำลอง" : "ปิด"}</p><p className="text-muted-foreground">ค่าเริ่มต้นปิด และไม่แสดง credential ในหน้านี้</p></div>
            {([['inApp', 'ข้อความในระบบ'], ['sms', 'SMS webhook'], ['line', 'LINE OA'], ['email', 'อีเมล SMTP']] as const).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-3"><p className="font-medium">{label}</p><Badge variant={providerHealth[key] === "READY" ? "default" : "outline"}>{providerHealth[key] === "READY" ? "พร้อมใช้" : providerHealth[key] === "UNAVAILABLE" ? "ยังไม่รองรับ" : "ปิด/ยังไม่ครบ"}</Badge></div>
            ))}
          </div>
        </aside>
      </div>

      <section aria-labelledby="notification-history-heading">
        <div className="mb-3">
          <h2 id="notification-history-heading" className="text-lg font-semibold">ประวัติล่าสุด</h2>
          <p className="text-sm text-muted-foreground">แสดงสูงสุด 50 รายการ เรียงจากรายการใหม่ที่สุด</p>
        </div>
        {history.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center">
            <BellRing className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 font-medium">ยังไม่มีประวัติการแจ้งเตือน</p>
            <p className="mt-1 text-sm text-muted-foreground">กด “ประมวลผลตอนนี้” เพื่อสร้างรายการตามเกณฑ์ปัจจุบัน</p>
          </div>
        ) : (
          <div className="divide-y overflow-hidden rounded-xl border bg-card">
            {history.map((item) => (
              <article key={item.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{item.title}</h3>
                      <Badge variant="outline">{typeLabel[item.type]}</Badge>
                      <Badge variant={item.status === "FAILED" ? "destructive" : item.status === "SENT" ? "default" : "secondary"}>{statusLabel[item.status]}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.memberCode} — {item.memberName} {item.memberLastName}</p>
                    <p className="mt-2 text-pretty text-sm">{item.message}</p>
                    {item.errorMessage ? <p className="mt-2 text-xs text-muted-foreground">หมายเหตุ: {item.errorMessage}</p> : null}
                    <p className="mt-1 text-xs text-muted-foreground">พยายามส่ง {item.attemptCount}/5 ครั้ง</p>
                    {((item.status === "FAILED" && item.failureKind === "RETRYABLE") || (item.status === "SKIPPED" && item.failureKind === "CONFIG")) && item.attemptCount < 5 ? (
                      <Button type="button" size="sm" variant="outline" className="mt-3" disabled={retryingId === item.id} onClick={() => handleRetry(item.id)}>
                        {retryingId === item.id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
                        ส่งซ้ำ
                      </Button>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-left text-xs text-muted-foreground sm:text-right">
                    <p>{channelLabel[item.channel]}</p>
                    <p className="mt-1 tabular-nums">{new Date(item.scheduledFor).toLocaleDateString("th-TH")}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
