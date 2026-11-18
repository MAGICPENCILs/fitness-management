"use client";

import { useRef, useState, type FormEvent } from "react";
import { CircleCheck, CircleMinus, Copy, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LineProviderSettingsDto } from "@/lib/line-provider-settings-service";

const fields = [
  { name: "accessToken", label: "Channel Access Token", clear: "clearAccessToken", configured: "accessTokenConfigured" },
  { name: "channelSecret", label: "Channel Secret", clear: "clearChannelSecret", configured: "channelSecretConfigured" },
] as const;
type Secret = typeof fields[number]["name"];
const endpoint = "/api/notification-provider-settings";

/** เจ้าของเห็นเฉพาะสถานะที่บันทึกไว้ ค่าลับที่พิมพ์จะอยู่ในช่องรหัสผ่านจนถึงการส่งฟอร์มเท่านั้น */
export function LineProviderSettingsCard({ initial }: { initial: LineProviderSettingsDto }) {
  const [settings, setSettings] = useState(initial);
  const [clears, setClears] = useState<Secret[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const first = settings.source !== "DATABASE";

  /** เมื่อเบราว์เซอร์ไม่อนุญาตให้คัดลอก ให้เลือกข้อความจริงและคืนโฟกัสให้คัดลอกเองได้ */
  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(initial.webhookUrl);
      setStatus("คัดลอก URL แล้ว");
    } catch {
      urlRef.current?.focus();
      urlRef.current?.select();
      setStatus("เลือก URL แล้ว กรุณาคัดลอกด้วยตนเอง");
    }
  }

  /** ส่งเฉพาะค่าที่เปลี่ยน พร้อม revision เดิม และไม่แสดงข้อความตอบกลับที่อาจมีข้อมูลลับ */
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const destination = String(data.get("destination") ?? "");
    const patch: Record<string, string | number | true> = { revision: settings.revision };
    setError(""); setStatus(""); setInvalid("");
    try {
      if (!/^U[0-9a-f]{32}$/.test(destination) || destination.length !== 33) {
        setInvalid("destination"); setError("ตรวจสอบ Destination / Bot ID ตามรูปแบบที่ระบุ แล้วกรอกค่าลับใหม่");
        (form.elements.namedItem("destination") as HTMLInputElement).focus();
        return;
      }
      if (first || destination !== settings.destination) patch.destination = destination;
      for (const field of fields) {
        const value = data.get(field.name);
        if (clears.includes(field.name)) patch[field.clear] = true;
        else if (typeof value === "string" && value !== "") patch[field.name] = value;
        else if (first) {
          setInvalid(field.name); setError(`การบันทึกครั้งแรกต้องกรอกค่าใหม่หรือเลือกล้าง ${field.label} กรุณากรอกค่าลับใหม่`);
          (form.elements.namedItem(field.name) as HTMLInputElement).focus();
          return;
        }
      }
      if (Object.keys(patch).length === 1) { setStatus("ไม่มีการเปลี่ยนแปลง"); return; }
      setBusy(true);
      const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" },
        redirect: "error", body: JSON.stringify(patch) });
      if (!response.ok) {
        setError(response.status === 409 ? "ข้อมูลเปลี่ยนแปลงหรือยังมีรายการผูกกับ LINE เดิม โปรดโหลดหน้าใหม่และตรวจสอบ Destination"
          : response.status === 400 ? "ตรวจสอบ Destination และกรอกค่าลับใหม่โดยไม่มีช่องว่าง แล้วลองใหม่"
          : "บันทึกไม่ได้ กรุณาตรวจสอบสิทธิ์และกรอกค่าลับใหม่เพื่อลองใหม่");
        return;
      }
      const { revision, accessTokenConfigured, channelSecretConfigured }: LineProviderSettingsDto = await response.json();
      // เก็บเฉพาะ metadata ที่ต้องใช้รอบถัดไป ไม่เก็บ response ทั้งก้อนใน state
      setSettings({ ...initial, source: "DATABASE", revision, destination, accessTokenConfigured, channelSecretConfigured });
      setStatus("บันทึกการตั้งค่า LINE แล้ว");
    } catch {
      setError("ยืนยันผลการบันทึกไม่ได้ โปรดโหลดหน้าใหม่และตรวจสอบก่อนลองใหม่");
    } finally {
      for (const field of fields) (form.elements.namedItem(field.name) as HTMLInputElement).value = "";
      setClears([]); setBusy(false);
    }
  }

  return (
    <section aria-labelledby="line-provider-title" className="space-y-5 rounded-xl border bg-card p-4 text-card-foreground shadow-sm sm:p-6">
      <header className="space-y-1">
        <h2 id="line-provider-title" className="text-lg font-semibold">ตั้งค่าการเชื่อมต่อ LINE OA</h2>
        <p className="flex items-start gap-2 text-sm text-muted-foreground"><LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" />บันทึกเพื่อเตรียมระบบเท่านั้น การส่ง LINE ยังปิดอยู่</p>
      </header>
      <div className="space-y-2">
        <Label htmlFor="line-webhook-url">Webhook URL</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input ref={urlRef} id="line-webhook-url" value={initial.webhookUrl} readOnly className="bg-muted/50" />
          <Button variant="outline" type="button" onClick={copyUrl}><Copy aria-hidden="true" />คัดลอก URL</Button>
        </div>
      </div>
      <form ref={formRef} noValidate method="post" action={endpoint} onSubmit={save} aria-busy={busy}>
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="line-destination">Destination / Bot ID (จำเป็น)</Label>
            <Input id="line-destination" name="destination" defaultValue={settings.destination ?? ""} required
              autoCapitalize="none" spellCheck={false} aria-invalid={invalid === "destination"}
              aria-describedby={invalid === "destination" ? "line-destination-hint line-provider-error" : "line-destination-hint"} />
            <p id="line-destination-hint" className="text-sm text-muted-foreground">รหัสบอตขึ้นต้นด้วย U ตามด้วยตัวเลขหรือ a–f ตัวเล็ก 32 ตัว เปลี่ยนบัญชีไม่ได้หากยังมีรายการผูกกับบัญชีเดิม</p>
          </div>
          {first && <p className="rounded-lg bg-muted p-3 text-sm">การบันทึกครั้งแรกต้องกรอกค่าใหม่หรือยืนยันล้างทั้งสองช่อง ระบบไม่คัดลอกค่าลับเดิมจากเซิร์ฟเวอร์</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map(field => {
              const clearing = clears.includes(field.name);
              const configured = settings[field.configured];
              const Icon = configured ? CircleCheck : CircleMinus;
              const id = `line-${field.name}`;
              return (
                <div key={id} className="min-w-0 space-y-2 rounded-lg border p-3">
                  <Label htmlFor={id}>{field.label}</Label>
                  <p id={`${id}-status`} className="flex items-center gap-2 text-sm"><Icon aria-hidden="true" className="size-4" />{configured ? "ตั้งค่าแล้ว" : "ยังไม่ตั้งค่า"}</p>
                  <Input id={id} name={field.name} type="password" autoComplete="new-password" autoCapitalize="none" spellCheck={false}
                    disabled={clearing} aria-invalid={invalid === field.name}
                    aria-describedby={`${id}-status ${id}-hint${invalid === field.name ? " line-provider-error" : ""}`} />
                  <p id={`${id}-hint`} className="text-sm text-muted-foreground">{clearing ? "จะล้างค่านี้เมื่อกดบันทึก" : first ? "กรอกค่าใหม่หรือเลือกล้างค่านี้" : "เว้นว่างเพื่อคงค่าเดิม หรือกรอกค่าใหม่เพื่อแทนที่"}</p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button type="button" variant="outline" onClick={event => {
                        if (clearing) { event.preventDefault(); setClears(clears.filter(name => name !== field.name)); }
                      }}>{clearing ? "ยกเลิกการล้าง" : "ล้าง"} {field.label}</Button>
                    </DialogTrigger>
                    <DialogContent showCloseButton={false}>
                      <DialogHeader><DialogTitle>ล้าง {field.label}?</DialogTitle>
                        <DialogDescription>หลังบันทึก ระบบจะไม่ใช้ค่าเดิม หากต้องการใช้อีกครั้งต้องกรอกค่าใหม่</DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline">ยกเลิก</Button></DialogClose>
                        <DialogClose asChild><Button type="button" variant="destructive" onClick={() => {
                          (formRef.current!.elements.namedItem(field.name) as HTMLInputElement).value = "";
                          setClears([...clears, field.name]); setInvalid("");
                        }}>ยืนยันการล้าง</Button></DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              );
            })}
          </div>
          <Button type="submit">{busy ? "กำลังบันทึก…" : "บันทึกการตั้งค่า LINE"}</Button>
        </fieldset>
      </form>
      {error && <p id="line-provider-error" role="alert" className="text-sm text-destructive">{error}</p>}
      <p role="status" className="text-sm text-muted-foreground empty:hidden">{busy ? "กำลังบันทึกการตั้งค่า LINE" : status}</p>
    </section>
  );
}
