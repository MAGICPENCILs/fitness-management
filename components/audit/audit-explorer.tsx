"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AuditRow = {
  id: number;
  branchId: number;
  branchName: string;
  actorStaffId: number;
  actorName: string;
  action: string;
  entityType: string;
  entityId: number | null;
  result: "SUCCESS" | "DENIED" | "FAILED";
  metadata: Record<string, unknown> | null;
  createdAt: string | null;
};

/** แสดง audit log ด้วย URL filters เพื่อให้ refresh, back และ deep link คงสภาพเดิม */
export function AuditExplorer({
  rows,
  branches,
  filters,
  pagination,
}: {
  rows: AuditRow[];
  branches: Array<{ id: number; name: string }>;
  filters: {
    branchId?: number;
    action?: string;
    result?: "SUCCESS" | "DENIED" | "FAILED";
    from?: string;
    to?: string;
  };
  pagination: { page: number; pageSize: number; total: number };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [branchId, setBranchId] = useState(
    filters.branchId ? String(filters.branchId) : "ALL",
  );
  const [result, setResult] = useState(filters.result ?? "ALL");
  const [action, setAction] = useState(filters.action ?? "");
  const [from, setFrom] = useState(filters.from ?? "");
  const [to, setTo] = useState(filters.to ?? "");
  const pageCount = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));

  /** เขียนตัวกรองลง URL และกลับหน้าแรกเมื่อเงื่อนไขเปลี่ยน */
  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (branchId !== "ALL") params.set("branchId", branchId);
    if (result !== "ALL") params.set("result", result);
    if (action.trim()) params.set("action", action.trim().toUpperCase());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    router.push(`${pathname}?${params.toString()}`);
  }

  /** เปลี่ยนหน้าโดยคงตัวกรองปัจจุบันทั้งหมดไว้ */
  function goToPage(page: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(page));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-5">
      <form onSubmit={applyFilters} className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-2"><Label>สาขา</Label><Select value={branchId} onValueChange={setBranchId}><SelectTrigger className="w-full" aria-label="สาขา"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">ทุกสาขา</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>ผลลัพธ์</Label><Select value={result} onValueChange={setResult}><SelectTrigger className="w-full" aria-label="ผลลัพธ์"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">ทุกผลลัพธ์</SelectItem><SelectItem value="SUCCESS">SUCCESS</SelectItem><SelectItem value="DENIED">DENIED</SelectItem><SelectItem value="FAILED">FAILED</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="audit-action">Action</Label><Input id="audit-action" value={action} onChange={(event) => setAction(event.target.value)} placeholder="เช่น STAFF_CREATED" /></div>
          <div className="space-y-2"><Label htmlFor="audit-from">ตั้งแต่วันที่</Label><Input id="audit-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="audit-to">ถึงวันที่</Label><Input id="audit-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
        </div>
        <Button type="submit" className="mt-4"><Filter aria-hidden="true" />ใช้ตัวกรอง</Button>
      </form>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm" aria-labelledby="audit-table-heading">
        <div className="border-b p-4 sm:p-5"><h2 id="audit-table-heading" className="font-semibold">เหตุการณ์ในระบบ</h2><p className="text-sm text-muted-foreground">พบ {pagination.total.toLocaleString("th-TH")} รายการ</p></div>
        <Table>
          <TableHeader><TableRow><TableHead>เวลา</TableHead><TableHead>ผู้ดำเนินการ</TableHead><TableHead>สาขา</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>ผลลัพธ์</TableHead><TableHead>Metadata</TableHead></TableRow></TableHeader>
          <TableBody>{rows.length ? rows.map((row) => <TableRow key={row.id}><TableCell className="tabular-nums">{row.createdAt ? new Date(row.createdAt).toLocaleString("th-TH") : "—"}</TableCell><TableCell>{row.actorName}</TableCell><TableCell>{row.branchName}</TableCell><TableCell className="font-mono text-xs">{row.action}</TableCell><TableCell>{row.entityType}{row.entityId ? ` #${row.entityId}` : ""}</TableCell><TableCell><Badge variant={row.result === "SUCCESS" ? "default" : row.result === "FAILED" ? "destructive" : "outline"}>{row.result}</Badge></TableCell><TableCell className="max-w-sm whitespace-normal font-mono text-xs text-muted-foreground">{row.metadata ? JSON.stringify(row.metadata) : "—"}</TableCell></TableRow>) : <TableRow><TableCell colSpan={7} className="h-28 text-center text-muted-foreground">ยังไม่มี audit log ตามตัวกรองนี้</TableCell></TableRow>}</TableBody>
        </Table>
        <div className="flex items-center justify-between gap-4 border-t p-4"><p className="text-sm text-muted-foreground tabular-nums">หน้า {pagination.page} จาก {pageCount}</p><div className="flex gap-2"><Button variant="outline" disabled={pagination.page <= 1} onClick={() => goToPage(pagination.page - 1)} aria-label="หน้าก่อนหน้า"><ChevronLeft aria-hidden="true" />ก่อนหน้า</Button><Button variant="outline" disabled={pagination.page >= pageCount} onClick={() => goToPage(pagination.page + 1)} aria-label="หน้าถัดไป">ถัดไป<ChevronRight aria-hidden="true" /></Button></div></div>
      </section>
    </div>
  );
}
