"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PauseCircle, PlayCircle, QrCode, RotateCw, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** รวม action Freeze/Unfreeze และ Dynamic QR โดยให้ API ตรวจโควตา สาขา และสถานะซ้ำ */
export function MembershipActions({
  memberId,
  memberStatus,
  activePackageId,
}: {
  memberId: number;
  memberStatus: string;
  activePackageId: number | null;
}) {
  const router = useRouter();
  const [days, setDays] = useState("1");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [qr, setQr] = useState<{ qrDataUrl: string; expiresAt: string } | null>(null);

  /** เรียก mutation แล้วแสดง error จาก server โดยไม่คาดเดาผลลัพธ์ฝั่ง client */
  async function mutate(url: string, method: "POST" | "DELETE", body?: unknown) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "ดำเนินการไม่สำเร็จ");
      return result;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "ดำเนินการไม่สำเร็จ");
      return null;
    } finally {
      setPending(false);
    }
  }

  /** เริ่มหรือจบ Freeze แล้ว refresh snapshot สมาชิก/แพ็กเกจ */
  async function handleFreeze(method: "POST" | "DELETE") {
    const result = await mutate(
      `/api/members/${memberId}/freeze`,
      method,
      method === "POST" ? { memberPackageId: activePackageId, days: Number(days), reason } : undefined,
    );
    if (result) router.refresh();
  }

  /** หมุน token และแสดง QR ที่หมดอายุใน 5 นาที โดย raw token ไม่ถูกเก็บใน component */
  async function handleRotateQr() {
    const result = await mutate(`/api/members/${memberId}/access-token`, "POST");
    if (result) setQr({ qrDataUrl: result.qrDataUrl, expiresAt: result.expiresAt });
  }

  /** revoke token บน server แล้วล้าง QR จากหน้าจอทันที */
  async function handleRevokeQr() {
    const result = await mutate(`/api/members/${memberId}/access-token`, "DELETE");
    if (result) setQr(null);
  }

  return (
    <section className="grid gap-4 lg:grid-cols-2" aria-label="วงจรสมาชิกและ Dynamic QR">
      <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
        <div><h2 className="font-semibold">Freeze สมาชิก</h2><p className="text-sm text-muted-foreground">สูงสุดรวม 30 วันต่อปี วันหมดอายุจะต่อเมื่อ Unfreeze</p></div>
        {memberStatus === "FROZEN" ? (
          <Button type="button" onClick={() => handleFreeze("DELETE")} disabled={pending}><PlayCircle className="size-4" aria-hidden="true" />Unfreeze และต่อวันหมดอายุ</Button>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
              <div className="space-y-1.5"><Label htmlFor="freeze-days">จำนวนวัน</Label><Input id="freeze-days" type="number" min={1} max={30} value={days} onChange={(event) => setDays(event.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="freeze-reason">เหตุผล</Label><Input id="freeze-reason" minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></div>
            </div>
            <Button type="button" onClick={() => handleFreeze("POST")} disabled={pending || !activePackageId || reason.trim().length < 3}><PauseCircle className="size-4" aria-hidden="true" />Freeze แพ็กเกจ</Button>
          </>
        )}
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
        <div><h2 className="flex items-center gap-2 font-semibold"><QrCode className="size-4" aria-hidden="true" />Dynamic QR</h2><p className="text-sm text-muted-foreground">หมดอายุใน 5 นาทีและ token เก่าถูก revoke เมื่อหมุนใหม่</p></div>
        {qr ? <div className="flex flex-col items-center rounded-lg bg-white p-4 text-zinc-950"><Image src={qr.qrDataUrl} alt="Dynamic QR สำหรับเข้าใช้บริการ" width={240} height={240} unoptimized /><p className="mt-2 text-xs">หมดอายุ {new Date(qr.expiresAt).toLocaleTimeString("th-TH")}</p></div> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={handleRotateQr} disabled={pending || memberStatus === "CANCELLED"}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RotateCw className="size-4" aria-hidden="true" />}สร้าง/หมุน QR</Button>
          <Button type="button" variant="outline" onClick={handleRevokeQr} disabled={pending}><ShieldX className="size-4" aria-hidden="true" />ยกเลิก QR</Button>
        </div>
      </div>
      {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive lg:col-span-2" role="alert">{error}</p> : null}
    </section>
  );
}
