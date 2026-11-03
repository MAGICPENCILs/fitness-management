"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, Dumbbell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** รับใบสมัครออนไลน์แบบ pending พร้อม consent ที่จำเป็น โดยไม่สื่อว่าได้สิทธิ์เข้าใช้ทันที */
export function SignupForm({ branches }: { branches: Array<{ id: number; name: string }> }) {
  const [branchId, setBranchId] = useState(branches[0] ? String(branches[0].id) : "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/member-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: Number(branchId),
          firstName: data.get("firstName"), lastName: data.get("lastName"),
          phone: data.get("phone"), email: data.get("email"), password: data.get("password"),
          servicePrivacyConsent: data.get("servicePrivacyConsent") === "on",
          marketingConsent: data.get("marketingConsent") === "on",
          policyVersion: "2026-11",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "ส่งใบสมัครไม่สำเร็จ");
      setComplete(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "ส่งใบสมัครไม่สำเร็จ");
    } finally { setPending(false); }
  }

  if (complete) return <div className="mx-auto max-w-lg rounded-2xl border bg-card p-8 text-center shadow-sm"><CheckCircle2 className="mx-auto size-12 text-success" /><h1 className="mt-4 text-2xl font-bold">รับใบสมัครแล้ว</h1><p className="mt-2 text-muted-foreground">พนักงานจะตรวจสอบก่อนสร้างบัญชีและสิทธิ์เข้าใช้บริการ</p><Button asChild className="mt-6"><Link href="/member-login">ไปหน้าเข้าสู่ระบบสมาชิก</Link></Button></div>;

  return <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-8">
    <header><Dumbbell className="mb-4 size-10 text-primary" /><h1 className="text-2xl font-bold">สมัครสมาชิก Fitness Pro</h1><p className="mt-1 text-sm text-muted-foreground">ใบสมัครต้องผ่านการตรวจสอบก่อน จึงยังไม่สามารถเข้าใช้บริการได้ทันที</p></header>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="signup-first">ชื่อ *</Label><Input id="signup-first" name="firstName" required maxLength={100} /></div><div className="space-y-1.5"><Label htmlFor="signup-last">นามสกุล *</Label><Input id="signup-last" name="lastName" required maxLength={100} /></div></div>
    <div className="space-y-1.5"><Label htmlFor="signup-branch">สาขาที่ต้องการสมัคร *</Label><Select value={branchId} onValueChange={setBranchId}><SelectTrigger id="signup-branch" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>)}</SelectContent></Select></div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="signup-phone">โทรศัพท์ *</Label><Input id="signup-phone" name="phone" type="tel" minLength={8} maxLength={20} required /></div><div className="space-y-1.5"><Label htmlFor="signup-email">อีเมล *</Label><Input id="signup-email" name="email" type="email" maxLength={191} required /></div></div>
    <div className="space-y-1.5"><Label htmlFor="signup-password">รหัสผ่าน *</Label><Input id="signup-password" name="password" type="password" minLength={12} maxLength={1024} required /><p className="text-xs text-muted-foreground">อย่างน้อย 12 ตัว มีตัวพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และอักขระพิเศษ</p></div>
    <label className="flex gap-3 rounded-lg border p-3 text-sm"><input name="servicePrivacyConsent" type="checkbox" required className="mt-0.5 size-4 accent-primary" /><span>ยอมรับนโยบายความเป็นส่วนตัวเพื่อให้บริการ *</span></label>
    <label className="flex gap-3 rounded-lg border p-3 text-sm"><input name="marketingConsent" type="checkbox" className="mt-0.5 size-4 accent-primary" /><span>ยินยอมรับข่าวสารและโปรโมชัน (ไม่บังคับ)</span></label>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <Button type="submit" className="w-full" disabled={pending || !branchId}>{pending ? <Loader2 className="size-4 animate-spin" /> : null}ส่งใบสมัคร</Button>
    <p className="text-center text-sm text-muted-foreground">มีบัญชีแล้ว? <Link href="/member-login" className="font-medium text-primary">เข้าสู่ระบบสมาชิก</Link></p>
  </form>;
}
