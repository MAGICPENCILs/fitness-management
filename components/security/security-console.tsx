"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Filter, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type SecurityTab = "sessions" | "limits" | "events";
type Pagination = { page: number; pageSize: number; total: number };
type StaffRole = "OWNER" | "MANAGER" | "COUNTER" | "TRAINER";
type SessionRow = {
  id: number; staffId: number; staffName: string; role: StaffRole; homeBranchId: number;
  branchName: string; mode: "FULL" | "PASSWORD_CHANGE_REQUIRED"; createdAt: string | null;
  lastSeenAt: string | null; absoluteExpiresAt: string | null; idleExpiresAt: string | null;
  revokedAt: string | null; revokedReason: string | null; status: string;
  ipFingerprint: string | null; userAgentCategory: string; manageable: boolean;
};
type LimitRow = {
  id: number; scope: "ACCOUNT" | "IP"; fingerprint: string | null; attemptCount: number;
  windowStartedAt: string | null; lockedUntil: string | null; updatedAt: string | null; locked: boolean;
  staff: { id: number; name: string; role: StaffRole; homeBranchId: number; branchName: string } | null;
  manageable: boolean;
};
type EventRow = {
  id: number; branchId: number | null; branchName: string | null; actorStaffId: number | null;
  actorName: string | null; action: string; entityType: string; entityId: number | null;
  result: "SUCCESS" | "DENIED" | "FAILED"; metadata: Record<string, unknown> | null; createdAt: string | null;
};
export type SecurityDashboardData = {
  sessions: { rows: SessionRow[]; pagination: Pagination };
  limits: { rows: LimitRow[]; pagination: Pagination };
  events: { rows: EventRow[]; pagination: Pagination };
};
type SecurityFilters = {
  tab: SecurityTab; branchId?: number; staffId?: number; action?: string;
  result?: "SUCCESS" | "DENIED" | "FAILED"; from?: string; to?: string;
};
type ActionTarget =
  | { kind: "session"; id: number; target: string }
  | { kind: "staff"; id: number; target: string }
  | { kind: "limit"; id: number; target: string };

const TABS: Array<{ value: SecurityTab; label: string }> = [
  { value: "sessions", label: "เซสชัน" },
  { value: "limits", label: "Rate limit" },
  { value: "events", label: "เหตุการณ์ Login" },
];
const ACTIONS = ["LOGIN_SUCCESS", "LOGIN_FAILED", "LOGIN_RATE_LIMITED", "LOGOUT_SUCCESS", "SESSION_EXPIRED", "SESSION_REVOKED", "PASSWORD_CHANGED", "PASSWORD_RESET", "AUTH_RATE_LIMIT_CLEARED"];
const DISPLAY_METADATA_KEYS = new Set(["reasonCode", "ipFingerprint", "userAgentCategory", "source", "scope", "count", "rotated"]);

/** แสดงเวลาในรูปแบบไทยโดยรักษา null เป็นเครื่องหมายที่อ่านได้ */
function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("th-TH") : "—";
}

function statusVariant(status: string) {
  if (status === "ACTIVE" || status === "SUCCESS") return "default" as const;
  if (status === "REVOKED" || status === "FAILED") return "destructive" as const;
  return "outline" as const;
}

/** กรองซ้ำที่ display boundary เพื่อไม่ render key แปลกปลอมหรือ fingerprint ที่ไม่ใช่ค่าย่อ แม้ DTO ถูกประกอบผิดพลาด */
function displayMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) return [];
  return Object.entries(metadata).filter(([key, value]) => {
    if (!DISPLAY_METADATA_KEYS.has(key)) return false;
    if (key === "ipFingerprint") {
      return typeof value === "string" && /^[a-f0-9]{1,12}$/i.test(value);
    }
    return typeof value === "number" || typeof value === "boolean" ||
      (typeof value === "string" && /^[A-Z0-9_.-]+$/.test(value));
  });
}

/** อ่านเฉพาะข้อความกลางจาก mutation response โดยไม่สะท้อนรายละเอียด transport ภายใน */
async function readMutationMessage(response: Response) {
  try {
    const payload: unknown = await response.json();
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const record = payload as Record<string, unknown>;
      if (typeof record.message === "string") return record.message;
      if (typeof record.error === "string") return record.error;
    }
  } catch {
    // body ว่างหรือไม่ใช่ JSON ใช้ข้อความกลางแทน
  }
  return response.ok ? "ดำเนินการสำเร็จ" : "ไม่สามารถดำเนินการได้";
}

/** ใช้ DTO ที่ server ลดรูปแล้ว และเชื่อ manageable เพื่อซ่อนปุ่มโดยไม่แทน authorization ฝั่ง server */
export function SecurityConsole({ data, branches, filters }: {
  data: SecurityDashboardData;
  branches: Array<{ id: number; name: string }>;
  filters: SecurityFilters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<SecurityTab>(filters.tab);
  const [branchId, setBranchId] = useState(filters.branchId ? String(filters.branchId) : "");
  const [staffId, setStaffId] = useState(filters.staffId ? String(filters.staffId) : "");
  const [action, setAction] = useState(filters.action ?? "");
  const [result, setResult] = useState(filters.result ?? "");
  const [from, setFrom] = useState(filters.from ?? "");
  const [to, setTo] = useState(filters.to ?? "");
  const [target, setTarget] = useState<ActionTarget | null>(null);
  const [pending, setPending] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [notice, setNotice] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  /** รักษา URL state เพื่อให้ refresh/back/deep link คงบริบทเดิม */
  function baseParams(tab = activeTab) {
    const params = new URLSearchParams();
    if (tab !== "sessions") params.set("tab", tab);
    if (filters.branchId) params.set("branchId", String(filters.branchId));
    if (filters.staffId) params.set("staffId", String(filters.staffId));
    if (filters.action) params.set("action", filters.action);
    if (filters.result) params.set("result", filters.result);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    return params;
  }

  function navigate(params: URLSearchParams) {
    const query = params.toString();
    router.push(query ? pathname + "?" + query : pathname);
  }

  function selectTab(tab: SecurityTab) {
    setActiveTab(tab);
    const params = baseParams(tab);
    params.delete("page");
    navigate(params);
  }

  /** รองรับ arrow/home/end ตาม WAI-ARIA tabs และย้าย focus พร้อม panel */
  function handleTabKey(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    selectTab(TABS[next].value);
    tabRefs.current[next]?.focus();
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (activeTab !== "sessions") params.set("tab", activeTab);
    if (branchId) params.set("branchId", branchId);
    if (staffId) params.set("staffId", staffId);
    if (activeTab === "events") {
      if (action) params.set("action", action);
      if (result) params.set("result", result);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
    }
    navigate(params);
  }

  function goToPage(page: number) {
    const params = baseParams();
    params.set("page", String(page));
    navigate(params);
  }

  function openAction(next: ActionTarget, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setDialogError("");
    setTarget(next);
  }

  function changeDialogOpen(open: boolean) {
    if (!open && !pending) {
      setTarget(null);
      setDialogError("");
    }
  }

  /** เรียก endpoint จาก internal id และคง dialog เมื่อผิดพลาดเพื่อให้ลองซ้ำได้ */
  async function confirmAction() {
    if (!target || pending) return;
    setPending(true);
    setDialogError("");
    const endpoint = target.kind === "session"
      ? "/api/security/sessions/" + target.id + "/revoke"
      : target.kind === "staff"
        ? "/api/security/staff/" + target.id + "/revoke"
        : "/api/security/rate-limits/" + target.id + "/clear";
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const message = await readMutationMessage(response);
      if (!response.ok) {
        setDialogError(message);
        return;
      }
      setNotice(message);
      setTarget(null);
      router.refresh();
    } catch {
      setDialogError("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่");
    } finally {
      setPending(false);
    }
  }

  const pagination = data[activeTab].pagination;
  const pageCount = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="ข้อมูลความปลอดภัย" className="grid grid-cols-3 rounded-xl border bg-muted/40 p-1">
          {TABS.map((tab, index) => (
            <button key={tab.value} ref={(element) => { tabRefs.current[index] = element; }}
              id={"security-tab-" + tab.value} type="button" role="tab"
              aria-selected={activeTab === tab.value} aria-controls={"security-panel-" + tab.value}
              tabIndex={activeTab === tab.value ? 0 : -1} onClick={() => selectTab(tab.value)}
              onKeyDown={(event) => handleTabKey(event, index)}
              className="min-h-11 rounded-lg px-2 text-sm font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-selected:bg-card aria-selected:text-foreground aria-selected:shadow-sm">
              {tab.label}
            </button>
          ))}
        </div>
        <Button type="button" variant="outline" onClick={() => router.refresh()} className="min-h-11">
          <RefreshCw aria-hidden="true" />รีเฟรชข้อมูล
        </Button>
      </div>

      <p role="status" aria-live="polite" className="min-h-5 text-sm text-primary">{notice}</p>

      {activeTab !== "limits" ? (
        <form onSubmit={applyFilters} className="rounded-xl border bg-card p-4 shadow-sm" aria-label="ตัวกรองความปลอดภัย">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2"><Label htmlFor="security-branch">สาขา</Label>
              <select id="security-branch" value={branchId} onChange={(event) => setBranchId(event.target.value)}
                className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <option value="">ทุกสาขาที่มีสิทธิ์</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </div>
            <div className="space-y-2"><Label htmlFor="security-staff">Staff ID</Label>
              <Input id="security-staff" inputMode="numeric" value={staffId}
                onChange={(event) => setStaffId(event.target.value.replace(/\D/g, ""))}
                placeholder="ทุกบัญชี" className="min-h-11" />
            </div>
            {activeTab === "events" ? <>
              <div className="space-y-2"><Label htmlFor="security-action">Action</Label>
                <select id="security-action" value={action} onChange={(event) => setAction(event.target.value)} className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm">
                  <option value="">ทุก action</option>{ACTIONS.map((value) => <option key={value}>{value}</option>)}
                </select>
              </div>
              <div className="space-y-2"><Label htmlFor="security-result">ผลลัพธ์</Label>
                <select id="security-result" value={result} onChange={(event) => setResult(event.target.value)} className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm">
                  <option value="">ทุกผลลัพธ์</option><option value="SUCCESS">SUCCESS</option><option value="DENIED">DENIED</option><option value="FAILED">FAILED</option>
                </select>
              </div>
              <div className="space-y-2"><Label htmlFor="security-from">ตั้งแต่วันที่</Label><Input id="security-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="min-h-11" /></div>
              <div className="space-y-2"><Label htmlFor="security-to">ถึงวันที่</Label><Input id="security-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="min-h-11" /></div>
            </> : null}
          </div>
          <Button type="submit" className="mt-4 min-h-11"><Filter aria-hidden="true" />ใช้ตัวกรอง</Button>
        </form>
      ) : null}

      <section id={"security-panel-" + activeTab} role="tabpanel" aria-labelledby={"security-tab-" + activeTab}
        className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b p-4 sm:p-5">
          <h2 className="font-semibold">{TABS.find((tab) => tab.value === activeTab)?.label}</h2>
          <p className="text-sm text-muted-foreground">พบ {pagination.total.toLocaleString("th-TH")} รายการ</p>
        </div>

        {activeTab === "sessions" ? <SessionsContent rows={data.sessions.rows} openAction={openAction} /> : null}
        {activeTab === "limits" ? <LimitsContent rows={data.limits.rows} openAction={openAction} /> : null}
        {activeTab === "events" ? <EventsContent rows={data.events.rows} /> : null}

        <div className="flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground tabular-nums">หน้า {pagination.page} จาก {pageCount}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="min-h-11" disabled={pagination.page <= 1} onClick={() => goToPage(pagination.page - 1)}><ChevronLeft aria-hidden="true" />ก่อนหน้า</Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={pagination.page >= pageCount} onClick={() => goToPage(pagination.page + 1)}>ถัดไป<ChevronRight aria-hidden="true" /></Button>
          </div>
        </div>
      </section>

      <Dialog open={Boolean(target)} onOpenChange={changeDialogOpen}>
        <DialogContent className="[&_[data-slot=dialog-close]]:size-11" aria-busy={pending} onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldAlert className="size-5 text-destructive" aria-hidden="true" />ยืนยันการจัดการความปลอดภัย</DialogTitle>
            <DialogDescription>
              {target?.kind === "limit"
                ? "ปลดล็อก " + target.target + " และเริ่มนับความพยายาม Login ใหม่"
                : (target?.kind === "staff" ? "ยกเลิกทุกเซสชัน" : "ยกเลิกเซสชันนี้") + " ของ " + target?.target + " ผู้ใช้จะต้องเข้าสู่ระบบใหม่"}
            </DialogDescription>
          </DialogHeader>
          <p aria-live="assertive" className="min-h-5 text-sm text-destructive">{dialogError}</p>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={() => changeDialogOpen(false)}>ยกเลิก</Button>
            <Button type="button" variant="destructive" className="min-h-11" disabled={pending} onClick={confirmAction}>
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {target?.kind === "limit" ? "ยืนยันปลดล็อก" : target?.kind === "staff" ? "ยืนยันยกเลิกทั้งหมด" : "ยืนยันยกเลิกเซสชัน"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SessionsContent({ rows, openAction }: { rows: SessionRow[]; openAction: (target: ActionTarget, trigger: HTMLButtonElement) => void }) {
  if (!rows.length) return <p className="p-8 text-center text-muted-foreground">ยังไม่มีเซสชันตามตัวกรองนี้</p>;
  return <><div className="hidden sm:block"><Table className="min-w-[920px]">
    <TableHeader><TableRow><TableHead>พนักงาน</TableHead><TableHead>บทบาท/สาขา</TableHead><TableHead>สถานะ</TableHead><TableHead>Login / ล่าสุด</TableHead><TableHead>หมดอายุ</TableHead><TableHead>อุปกรณ์</TableHead><TableHead className="text-right">จัดการ</TableHead></TableRow></TableHeader>
    <TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.staffName}</TableCell><TableCell>{row.role}<span className="block text-xs text-muted-foreground">{row.branchName}</span></TableCell><TableCell><Badge variant={statusVariant(row.status)}>{row.status}</Badge></TableCell><TableCell>{formatDate(row.createdAt)}<span className="block text-xs">ล่าสุด {formatDate(row.lastSeenAt)}</span></TableCell><TableCell>{formatDate(row.absoluteExpiresAt)}</TableCell><TableCell>{row.userAgentCategory}<span className="block font-mono text-xs">{row.ipFingerprint ?? "ไม่มี fingerprint"}</span></TableCell><TableCell><SessionActions row={row} openAction={openAction} /></TableCell></TableRow>)}</TableBody>
  </Table></div><div className="space-y-3 p-3 sm:hidden">{rows.map((row) => <article key={row.id} className="space-y-3 rounded-xl border p-4"><div className="flex justify-between gap-3"><div><h3 className="font-semibold">{row.staffName}</h3><p className="text-sm text-muted-foreground">{row.role} · {row.branchName}</p></div><Badge variant={statusVariant(row.status)}>{row.status}</Badge></div><dl className="grid gap-2 text-sm"><div><dt className="text-muted-foreground">Login / ล่าสุด</dt><dd>{formatDate(row.createdAt)} / {formatDate(row.lastSeenAt)}</dd></div><div><dt className="text-muted-foreground">อุปกรณ์ / fingerprint ย่อ</dt><dd>{row.userAgentCategory} · <span className="font-mono">{row.ipFingerprint ?? "—"}</span></dd></div></dl><SessionActions row={row} openAction={openAction} /></article>)}</div></>;
}

function SessionActions({ row, openAction }: { row: SessionRow; openAction: (target: ActionTarget, trigger: HTMLButtonElement) => void }) {
  if (!row.manageable) return null;
  return <div className="flex flex-wrap justify-end gap-2">{row.status === "ACTIVE" ? <Button type="button" variant="outline" className="min-h-11" aria-label={"ยกเลิกเซสชันของ " + row.staffName} onClick={(event) => openAction({ kind: "session", id: row.id, target: row.staffName }, event.currentTarget)}>ยกเลิกรายการ</Button> : null}<Button type="button" variant="destructive" className="min-h-11" aria-label={"ยกเลิกทุกเซสชันของ " + row.staffName} onClick={(event) => openAction({ kind: "staff", id: row.staffId, target: row.staffName }, event.currentTarget)}>ยกเลิกทั้งหมด</Button></div>;
}

function LimitsContent({ rows, openAction }: { rows: LimitRow[]; openAction: (target: ActionTarget, trigger: HTMLButtonElement) => void }) {
  if (!rows.length) return <p className="p-8 text-center text-muted-foreground">ยังไม่มี rate limit ตามขอบเขตที่มีสิทธิ์</p>;
  return <div className="space-y-3 p-3">{rows.map((row) => <article key={row.id} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-center"><div><h3 className="font-semibold">{row.staff?.name ?? "ไม่ทราบบัญชี"}</h3><p className="text-sm text-muted-foreground">{row.scope}{row.staff ? " · " + row.staff.branchName : ""}</p></div><div><p className="text-xs text-muted-foreground">Fingerprint ย่อ / จำนวนครั้ง</p><p className="font-mono text-sm">{row.fingerprint ?? "—"} · {row.attemptCount}</p></div><div><Badge variant={row.locked ? "destructive" : "outline"}>{row.locked ? "LOCKED" : "ไม่ล็อก"}</Badge><p className="mt-1 text-xs text-muted-foreground">ถึง {formatDate(row.lockedUntil)}</p></div>{row.manageable && (row.attemptCount > 0 || row.locked) ? <Button type="button" variant="outline" className="min-h-11" aria-label={"ปลดล็อก " + (row.staff?.name ?? row.fingerprint ?? "ไม่ทราบบัญชี")} onClick={(event) => openAction({ kind: "limit", id: row.id, target: row.staff?.name ?? "fingerprint " + (row.fingerprint ?? "ไม่ทราบ") }, event.currentTarget)}>ปลดล็อก</Button> : null}</article>)}</div>;
}

function EventsContent({ rows }: { rows: EventRow[] }) {
  if (!rows.length) return <p className="p-8 text-center text-muted-foreground">ยังไม่มีเหตุการณ์ตามตัวกรองนี้</p>;
  return <div className="space-y-3 p-3">{rows.map((row) => { const metadata = displayMetadata(row.metadata); return <article key={row.id} className="grid gap-3 rounded-xl border p-4 lg:grid-cols-[1fr_1fr_1.2fr]"><div><p className="font-mono text-xs text-muted-foreground">{formatDate(row.createdAt)}</p><h3 className="mt-1 font-semibold">{row.actorName ?? "ไม่ทราบบัญชี"}</h3><p className="text-sm text-muted-foreground">{row.branchName ?? "ไม่ทราบสาขา"}</p></div><div><p className="font-mono text-sm">{row.action}</p><Badge className="mt-2" variant={statusVariant(row.result)}>{row.result}</Badge></div><dl className="font-mono text-xs text-muted-foreground">{metadata.length ? metadata.map(([key, value]) => <div key={key}><dt className="inline text-foreground">{key}: </dt><dd className="inline">{String(value)}</dd></div>) : <div>—</div>}</dl></article>; })}</div>;
}
