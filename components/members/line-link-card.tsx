"use client";

import { useEffect, useId, useState } from "react";
import { CheckCircle2, Clock3, Copy, Link2Off, Loader2, RefreshCw, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import type { LineLinkStatus } from "@/lib/line-link-policy";

const states = {
  UNLINKED: { label: "ยังไม่เชื่อมต่อ", icon: Link2Off },
  PENDING: { label: "รอสมาชิกยืนยัน", icon: Clock3 },
  LINKED: { label: "เชื่อมต่อแล้ว", icon: CheckCircle2 },
};

/** อ่านเฉพาะ DTO ที่อนุญาตและไม่เก็บ identifier/hash หรือ command จาก GET */
async function requestStatus(memberId: number, method: "GET" | "POST" | "DELETE") {
  const response = await fetch(`/api/members/${memberId}/line-link`, { method, cache: "no-store" });
  if (!response.ok) throw new Error("LINE_LINK_REQUEST_FAILED");
  const body = await response.json();
  if (!body || !Object.hasOwn(states, body.status)) throw new Error("INVALID_LINE_LINK_STATUS");
  const status: LineLinkStatus = {
    status: body.status,
    challengeExpiresAt: body.status === "PENDING" ? body.challengeExpiresAt : null,
    linkedAt: body.status === "LINKED" ? body.linkedAt : null,
  };
  const command = method === "POST" && body.status === "PENDING" && typeof body.command === "string" && /^LINK [A-Za-z0-9_-]{43}$/.test(body.command) ? body.command : null;
  if (method === "POST" && !command) throw new Error("INVALID_LINE_LINK_COMMAND");
  return { status, command };
}

/** เก็บ command เฉพาะ state ของการออกครั้งนี้; refresh/ถอด component แล้วต้องออกคำสั่งใหม่ */
export function LineLinkCard({ memberId }: { memberId: number }) {
  const headingId = useId();
  const [status, setStatus] = useState<LineLinkStatus | null>(null);
  const [command, setCommand] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("กำลังโหลดสถานะ LINE");

  // ไม่ให้ response ที่มาช้าจาก component เก่าแสดงสถานะข้ามสมาชิก
  useEffect(() => {
    let active = true;
    requestStatus(memberId, "GET").then(result => {
      if (active) { setStatus(result.status); setFeedback(""); }
    }).catch(() => {
      if (active) { setError("โหลดสถานะ LINE ไม่สำเร็จ กรุณารีเฟรชเพื่อลองอีกครั้ง"); setFeedback(""); }
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [memberId]);

  /** ส่ง mutation แบบไม่มี body และล้าง command เดิมก่อน refresh/หมุน/ยกเลิกเสมอ */
  async function update(method: "GET" | "POST" | "DELETE") {
    setBusy(true);
    setCommand(null);
    setError("");
    setFeedback(method === "GET" ? "กำลังโหลดสถานะ LINE" : "กำลังดำเนินการ");
    if (method === "GET") setStatus(null);
    try {
      const result = await requestStatus(memberId, method);
      setStatus(result.status);
      setCommand(result.command);
      setConfirmOpen(false);
      setFeedback(method === "POST" ? "สร้างคำสั่งแล้ว กรุณาส่งให้สมาชิกเป็นการส่วนตัว" : method === "DELETE" ? "ยกเลิกการเชื่อมต่อ LINE แล้ว" : "อัปเดตสถานะ LINE แล้ว");
    } catch {
      setFeedback("");
      setError(method === "GET" ? "โหลดสถานะ LINE ไม่สำเร็จ กรุณารีเฟรชเพื่อลองอีกครั้ง" : method === "POST" ? "สร้างคำสั่งไม่สำเร็จ ตรวจความยินยอมใช้ข้อมูลเพื่อให้บริการและรีเฟรชสถานะก่อนลองอีกครั้ง" : "ยกเลิกการเชื่อมต่อไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally { setBusy(false); }
  }

  /** คัดลอกเฉพาะ command ที่ออกในหน้านี้ และไม่แสดงรายละเอียด clipboard error */
  async function copyCommand() {
    if (!command) return;
    setError("");
    try {
      await navigator.clipboard.writeText(command);
      setFeedback("คัดลอกคำสั่งแล้ว");
    } catch { setError("คัดลอกไม่สำเร็จ กรุณาเลือกและคัดลอกคำสั่งด้วยตนเอง"); }
  }

  const state = status ? states[status.status] : null;
  const Icon = state?.icon;
  const timestamp = status?.status === "PENDING" ? status.challengeExpiresAt : status?.linkedAt;
  const errorMessage = error && <p role="alert" className="text-sm text-destructive">{error}</p>;

  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-4 rounded-xl border bg-card p-4 text-card-foreground shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id={headingId} className="text-lg font-semibold">การเชื่อมต่อ LINE</h2>
          <p className="text-sm text-muted-foreground">ผูกบัญชีผ่านคำสั่งที่สมาชิกส่งไปยัง LINE OA ด้วยตนเอง ยังไม่เปิดส่งการแจ้งเตือน LINE</p>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => update("GET")} aria-label="รีเฟรชสถานะ LINE"><RefreshCw aria-hidden="true" />รีเฟรชสถานะ</Button>
      </div>
      <div role="status" aria-live="polite" aria-atomic="true" className="space-y-2 text-sm">
        {state && Icon && <p className="flex items-center gap-2 font-medium"><Icon className="size-5 shrink-0" aria-hidden="true" />{state.label}</p>}
        {timestamp && <p className="text-muted-foreground">{status?.status === "PENDING" ? "คำสั่งหมดอายุ: " : "เชื่อมต่อเมื่อ: "}<time dateTime={timestamp}>{new Date(timestamp).toLocaleString("th-TH")}</time></p>}
        {feedback && <p className="flex items-center gap-2">{busy && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}{feedback}</p>}
      </div>
      {!confirmOpen && errorMessage}
      {command && <div className="min-w-0 space-y-3 rounded-lg border bg-muted/40 p-3">
        <p className="text-sm text-muted-foreground">ตรวจตัวสมาชิกแล้วส่งคำสั่งนี้เป็นการส่วนตัว ห้ามเผยแพร่: ผู้ที่มีคำสั่งอาจเชื่อมต่อแทนได้ ใช้ได้ครั้งเดียวภายใน 15 นาที และไม่แสดงซ้ำหลังรีเฟรช</p>
        <code className="block min-w-0 whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-sm text-foreground select-text">{command}</code>
        <Button variant="outline" onClick={copyCommand} disabled={busy} aria-label="คัดลอกคำสั่งเชื่อมต่อ LINE"><Copy aria-hidden="true" />คัดลอกคำสั่ง</Button>
      </div>}
      {status?.status === "PENDING" && !command && <p className="text-sm text-muted-foreground">ไม่สามารถดึงคำสั่งเดิมซ้ำได้ หากสมาชิกยังไม่มีคำสั่ง ให้สร้างคำสั่งใหม่แทนคำสั่งเดิม</p>}
      {status && <div className="flex flex-wrap gap-2">
        {status.status !== "LINKED" && <Button disabled={busy} onClick={() => update("POST")}>{status.status === "PENDING" ? "สร้างคำสั่งใหม่" : "สร้างคำสั่งเชื่อมต่อ"}</Button>}
        {status.status !== "UNLINKED" && <Dialog open={confirmOpen} onOpenChange={open => { if (!busy) { setConfirmOpen(open); setError(""); } }}>
          <DialogTrigger asChild><Button variant="destructive" disabled={busy}><Unlink aria-hidden="true" />{status.status === "PENDING" ? "ยกเลิกคำสั่ง" : "ยกเลิกการเชื่อมต่อ"}</Button></DialogTrigger>
          <DialogContent showCloseButton={false}>
            <DialogHeader><DialogTitle>ยืนยันยกเลิกการเชื่อมต่อ LINE</DialogTitle><DialogDescription>คำสั่งที่รอยืนยันและการเชื่อมต่อปัจจุบันจะใช้ไม่ได้ หากต้องการเชื่อมต่ออีกครั้งต้องสร้างคำสั่งใหม่</DialogDescription></DialogHeader>
            {errorMessage}
            <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setConfirmOpen(false)}>กลับ</Button><Button variant="destructive" disabled={busy} aria-busy={busy} onClick={() => update("DELETE")}>{busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}ยืนยันยกเลิก</Button></DialogFooter>
          </DialogContent>
        </Dialog>}
      </div>}
    </section>
  );
}
