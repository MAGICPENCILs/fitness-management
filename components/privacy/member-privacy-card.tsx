"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Loader2,
  Mail,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PrivacyFeedback } from "@/components/privacy/privacy-manager";

export type ConsentType = "SERVICE_PRIVACY" | "MARKETING" | "PHOTO";
export type ConsentDisplay = {
  granted: boolean;
  policyVersion: string;
  updatedAt: string | null;
  actorName: string;
};

const consentDetails: Record<
  ConsentType,
  { label: string; description: string; icon: typeof ShieldCheck }
> = {
  SERVICE_PRIVACY: {
    label: "การใช้ข้อมูลเพื่อให้บริการ",
    description: "จำเป็นต่อการเป็นสมาชิกและการเข้าใช้บริการ",
    icon: ShieldCheck,
  },
  MARKETING: {
    label: "การตลาด",
    description: "ใช้ส่งข่าวสาร โปรโมชัน และติดตาม CRM",
    icon: Mail,
  },
  PHOTO: {
    label: "รูปถ่ายสมาชิก",
    description: "ใช้แสดงตัวตนในระบบและการตรวจสอบหน้าสาขา",
    icon: Camera,
  },
};

/** แสดง consent ledger ล่าสุดและเปิดให้เพิ่ม event ใหม่โดยไม่แก้ไขประวัติเดิม */
export function MemberPrivacyCard({
  memberId,
  snapshot,
  canManage,
  anonymized = false,
}: {
  memberId: number;
  snapshot: Record<ConsentType, ConsentDisplay | null>;
  canManage: boolean;
  anonymized?: boolean;
}) {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<ConsentType | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  /** บันทึก consent event ตามค่าตรงข้ามสถานะปัจจุบัน และ refresh เมื่อ server ยืนยันแล้ว */
  async function changeConsent() {
    if (!selectedType) return;
    const current = snapshot[selectedType]?.granted ?? false;
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/privacy/consents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId,
          consentType: selectedType,
          action: current ? "WITHDRAWN" : "GRANTED",
          policyVersion: "2026-01",
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "บันทึก consent ไม่สำเร็จ");
      setSelectedType(null);
      setFeedback({ type: "success", message: body.message });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "บันทึก consent ไม่สำเร็จ",
      });
    } finally {
      setPending(false);
    }
  }

  /** สร้างคำขอ anonymization แยกจากการถอน service consent เพื่อไม่ให้ผู้ใช้เข้าใจว่าเป็นการลบทันที */
  async function createAnonymizationRequest() {
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/privacy/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, reason }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "สร้างคำขอไม่สำเร็จ");
      setRequestOpen(false);
      setReason("");
      setFeedback({ type: "success", message: body.message });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "สร้างคำขอไม่สำเร็จ",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="member-privacy-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-sm font-medium text-primary">PDPA</p><h2 id="member-privacy-heading" className="text-lg font-semibold">ความยินยอมและข้อมูลส่วนบุคคล</h2><p className="text-sm text-muted-foreground">แสดงสถานะล่าสุดจาก consent ledger</p></div>
        {canManage && !anonymized && <Button variant="destructive" onClick={() => setRequestOpen(true)}><ShieldX aria-hidden="true" />สร้างคำขอทำข้อมูลนิรนาม</Button>}
      </div>
      {feedback && !selectedType && !requestOpen && <div className="mt-4"><PrivacyFeedback {...feedback} /></div>}
      {anonymized && <div className="mt-4 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground"><p className="font-medium text-foreground">สมาชิกนี้ถูกทำข้อมูลนิรนามแล้ว</p><p>ข้อมูล consent แสดงเพื่อการตรวจสอบย้อนหลังเท่านั้นและไม่สามารถแก้ไขได้</p></div>}
      <div className="mt-4 divide-y rounded-lg border">
        {(Object.entries(consentDetails) as Array<[ConsentType, (typeof consentDetails)[ConsentType]]>).map(([type, detail]) => {
          const state = snapshot[type];
          const Icon = detail.icon;
          return <div key={type} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1"><h3 className="font-medium">{detail.label}</h3><p className="text-sm text-muted-foreground">{detail.description}</p><p className="mt-1 text-xs text-muted-foreground">{state ? `นโยบาย ${state.policyVersion} · ${state.actorName} · ${state.updatedAt ? new Date(state.updatedAt).toLocaleString("th-TH") : "ยังไม่บันทึกเวลา"}` : "ยังไม่บันทึก consent"}</p></div>
            <div className="flex items-center gap-2 sm:justify-end"><Badge variant={state?.granted ? "default" : "outline"}>{state?.granted ? <CheckCircle2 aria-hidden="true" /> : <ShieldX aria-hidden="true" />}{state?.granted ? "ยินยอม" : "ไม่ยินยอม"}</Badge>{canManage && !anonymized && <Button variant="outline" onClick={() => setSelectedType(type)}>{state?.granted ? "ถอนความยินยอม" : "บันทึกความยินยอม"}</Button>}</div>
          </div>;
        })}
      </div>

      <Dialog open={selectedType !== null} onOpenChange={(open) => !open && setSelectedType(null)}>
        <DialogContent><DialogHeader><DialogTitle>{snapshot[selectedType ?? "MARKETING"]?.granted ? "ถอนความยินยอม" : "บันทึกความยินยอม"}</DialogTitle><DialogDescription>{selectedType === "SERVICE_PRIVACY" && snapshot.SERVICE_PRIVACY?.granted ? "การถอนรายการนี้จะระงับสมาชิกทันที แต่ยังไม่ลบข้อมูล กรุณาสร้างคำขอทำข้อมูลนิรนามแยกต่างหากหากสมาชิกต้องการลบ PII" : "ระบบจะเพิ่ม event ใหม่ใน ledger และเก็บประวัติเดิมไว้"}</DialogDescription></DialogHeader>{selectedType === "SERVICE_PRIVACY" && snapshot.SERVICE_PRIVACY?.granted && <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning-surface p-3 text-sm text-warning-foreground"><AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" /><p>สมาชิกจะเข้าใช้บริการไม่ได้ทันทีหลังยืนยัน</p></div>}{feedback?.type === "error" && <PrivacyFeedback {...feedback} />}<DialogFooter><Button variant="outline" onClick={() => setSelectedType(null)}>ยกเลิก</Button><Button variant={snapshot[selectedType ?? "MARKETING"]?.granted ? "destructive" : "default"} disabled={pending} onClick={changeConsent}>{pending && <Loader2 className="animate-spin" aria-hidden="true" />}ยืนยันการเปลี่ยน consent</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent><DialogHeader><DialogTitle>สร้างคำขอทำข้อมูลนิรนาม</DialogTitle><DialogDescription>คำขอจะต้องผ่านการอนุมัติโดย Owner หรือ Manager คนอื่นก่อนล้าง PII</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="privacy-request-reason">เหตุผลคำขอ</Label><Input id="privacy-request-reason" required minLength={5} value={reason} onChange={(event) => setReason(event.target.value)} aria-describedby="privacy-request-help" /><p id="privacy-request-help" className="text-sm text-muted-foreground">หลีกเลี่ยงการกรอกชื่อ เบอร์โทร หรือข้อมูลระบุตัวบุคคลในเหตุผล</p></div>{feedback?.type === "error" && <PrivacyFeedback {...feedback} />}<DialogFooter><Button variant="outline" onClick={() => setRequestOpen(false)}>ยกเลิก</Button><Button variant="destructive" disabled={pending || reason.trim().length < 5} onClick={createAnonymizationRequest}>{pending && <Loader2 className="animate-spin" aria-hidden="true" />}ส่งคำขอ</Button></DialogFooter></DialogContent>
      </Dialog>
    </section>
  );
}
