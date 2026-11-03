"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Application = { id: number; firstName: string; lastName: string; phone: string; email: string; status: "PENDING" | "APPROVED" | "REJECTED"; reviewNote: string | null; createdAt: Date | null };

/** แสดงใบสมัครของสาขาปัจจุบันและส่งคำตัดสินให้ transaction ฝั่ง server */
export function ApplicationManager({ applications }: { applications: Application[] }) {
  const router = useRouter(); const [pendingId, setPendingId] = useState<number | null>(null); const [error, setError] = useState("");
  async function review(id: number, decision: "APPROVE" | "REJECT") { setPendingId(id); setError(""); try { const response = await fetch(`/api/member-applications/${id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); router.refresh(); } catch (reviewError) { setError(reviewError instanceof Error ? reviewError.message : "ดำเนินการไม่สำเร็จ"); } finally { setPendingId(null); } }
  return <div className="space-y-4">{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}{applications.length ? applications.map((item) => <article key={item.id} className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><h2 className="font-semibold">{item.firstName} {item.lastName}</h2><Badge variant={item.status === "PENDING" ? "secondary" : item.status === "APPROVED" ? "default" : "destructive"}>{item.status}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{item.email} · {item.phone}</p><p className="mt-1 text-xs text-muted-foreground">สมัคร {item.createdAt?.toLocaleString("th-TH")}</p></div>{item.status === "PENDING" ? <div className="flex gap-2"><Button size="sm" onClick={() => review(item.id, "APPROVE")} disabled={pendingId === item.id}>{pendingId === item.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}อนุมัติ</Button><Button size="sm" variant="outline" onClick={() => review(item.id, "REJECT")} disabled={pendingId === item.id}><X className="size-4" />ปฏิเสธ</Button></div> : null}</div></article>) : <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">ยังไม่มีใบสมัครออนไลน์</div>}</div>;
}
