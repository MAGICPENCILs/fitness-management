"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";

/** จัดการ Dynamic QR และ Logout ด้วย Member cookie เท่านั้น */
export function PortalActions() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [qr, setQr] = useState<{ qrDataUrl: string; expiresAt: string } | null>(null);
  const [error, setError] = useState("");

  async function createQr() {
    setPending(true); setError("");
    try { const response = await fetch("/api/member-portal/qr", { method: "POST" }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setQr(result); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "สร้าง QR ไม่สำเร็จ"); }
    finally { setPending(false); }
  }

  async function logout() {
    setPending(true); setError("");
    try { const response = await fetch("/api/member-auth/logout", { method: "POST" }); if (!response.ok) throw new Error("ออกจากระบบไม่สำเร็จ"); router.replace("/member-login"); router.refresh(); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "ออกจากระบบไม่สำเร็จ"); setPending(false); }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2"><Button onClick={createQr} disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}สร้าง Dynamic QR</Button><Button variant="outline" onClick={logout} disabled={pending}><LogOut className="size-4" />ออกจากระบบ</Button></div>
    {qr ? <div className="w-fit rounded-xl bg-white p-4 text-center text-zinc-950 shadow-sm"><Image src={qr.qrDataUrl} alt="QR เข้าใช้บริการ" width={240} height={240} unoptimized /><p className="text-xs">หมดอายุ {new Date(qr.expiresAt).toLocaleTimeString("th-TH")}</p></div> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </div>;
}
