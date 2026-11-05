"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Dumbbell, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Login สมาชิกและใช้ hard navigation เพื่อให้ server อ่าน cookie ใหม่ใน request ถัดไปแน่นอน */
export function MemberLoginForm() {
  const [pending, setPending] = useState(false); const [error, setError] = useState("");
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setPending(true); setError("");
    try { const response = await fetch("/api/member-auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "เข้าสู่ระบบไม่สำเร็จ"); window.location.assign(result.returnTo); }
    catch (loginError) { setError(loginError instanceof Error ? loginError.message : "เข้าสู่ระบบไม่สำเร็จ"); setPending(false); }
  }
  return <form onSubmit={handleSubmit} className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-6 shadow-lg sm:p-8"><Dumbbell className="size-10 text-primary" /><div><p className="text-sm font-medium text-primary">Fitness Pro Member</p><h1 className="text-2xl font-bold">เข้าสู่ระบบสมาชิก</h1></div><div className="space-y-1.5"><Label htmlFor="member-email">อีเมล</Label><Input id="member-email" name="email" type="email" autoComplete="email" required /></div><div className="space-y-1.5"><Label htmlFor="member-password">รหัสผ่าน</Label><Input id="member-password" name="password" type="password" autoComplete="current-password" required /></div>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<Button type="submit" className="w-full" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}เข้าสู่ระบบ</Button><p className="text-center text-sm text-muted-foreground">ยังไม่มีบัญชี? <Link className="font-medium text-primary" href="/signup">สมัครออนไลน์</Link></p></form>;
}
