"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  RotateCcw,
  SearchCheck,
  ShieldAlert,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PrivacyStatus = "PENDING" | "APPROVED" | "COMPLETED" | "REJECTED";
type CleanupStatus = "NOT_REQUIRED" | "PENDING" | "COMPLETED" | "FAILED";
type PrivacyRequestRow = {
  id: number;
  memberId: number;
  memberCode: string;
  memberName: string;
  branchId: number;
  branchName: string;
  status: PrivacyStatus;
  reason: string;
  requestedByStaffId: number;
  requestedByName: string;
  requestedAt: string | null;
  fileCleanupStatus: CleanupStatus;
};

const statusLabels: Record<PrivacyStatus, string> = {
  PENDING: "รอพิจารณา",
  APPROVED: "อนุมัติแล้ว",
  COMPLETED: "เสร็จสมบูรณ์",
  REJECTED: "ปฏิเสธ",
};

/** แสดงผลลัพธ์จาก API ด้วย live-region ที่เหมาะกับระดับความสำคัญ */
export function PrivacyFeedback({
  type,
  message,
}: {
  type: "success" | "error";
  message: string;
}) {
  return (
    <p
      role={type === "error" ? "alert" : "status"}
      className={
        type === "error"
          ? "rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          : "rounded-lg border border-success/30 bg-success-surface p-3 text-sm text-success"
      }
    >
      {message}
    </p>
  );
}

/** แสดงคิวคำขอ PDPA และบังคับ typed confirmation ก่อนการล้างข้อมูลที่ย้อนกลับไม่ได้ */
export function PrivacyManager({
  requests,
  permissions,
}: {
  requests: PrivacyRequestRow[];
  permissions: {
    canApprove: boolean;
    canCreate: boolean;
    canRetryCleanup: boolean;
  };
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selected, setSelected] = useState<PrivacyRequestRow | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const filteredRequests = useMemo(
    () =>
      requests.filter(
        (request) => statusFilter === "ALL" || request.status === statusFilter,
      ),
    [requests, statusFilter],
  );

  /** เปิดหน้าต่างพิจารณาพร้อมล้างข้อความยืนยันจากรายการก่อน */
  function openReview(request: PrivacyRequestRow) {
    setSelected(request);
    setConfirmation("");
    setReviewNote("");
    setFeedback(null);
  }

  /** ส่งผลพิจารณาไปยัง server และรักษา dialog ไว้เมื่อมีข้อผิดพลาดเพื่อให้แก้ไขต่อ */
  async function review(status: "APPROVED" | "REJECTED") {
    if (!selected) return;
    setPendingAction(status);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/privacy/requests/${selected.id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, reviewNote }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "พิจารณาคำขอไม่สำเร็จ");
      setSelected(null);
      setFeedback({ type: "success", message: body.message });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "พิจารณาคำขอไม่สำเร็จ",
      });
    } finally {
      setPendingAction(null);
    }
  }

  /** ลองลบไฟล์ quarantine ซ้ำเฉพาะแถวที่ server ระบุว่า cleanup ล้มเหลว */
  async function retryCleanup(requestId: number) {
    setPendingAction(`retry-${requestId}`);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/privacy/requests/${requestId}/retry-cleanup`,
        { method: "POST" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "retry cleanup ไม่สำเร็จ");
      setFeedback({ type: "success", message: body.message });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "retry cleanup ไม่สำเร็จ",
      });
    } finally {
      setPendingAction(null);
    }
  }

  const pendingCount = requests.filter((row) => row.status === "PENDING").length;
  const approvedCount = requests.filter((row) => row.status === "APPROVED").length;
  const failedCount = requests.filter((row) => row.fileCleanupStatus === "FAILED").length;
  const completedCount = requests.filter((row) => row.status === "COMPLETED").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="รอพิจารณา" value={pendingCount} icon={Clock3} tone="warning" />
        <StatCard label="อนุมัติแล้ว" value={approvedCount} icon={SearchCheck} tone="info" />
        <StatCard label="cleanup ล้มเหลว" value={failedCount} icon={AlertTriangle} tone="destructive" />
        <StatCard label="เสร็จสมบูรณ์" value={completedCount} icon={CheckCircle2} tone="success" />
      </div>
      {feedback && !selected && <PrivacyFeedback {...feedback} />}
      <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="privacy-requests-heading">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 id="privacy-requests-heading" className="text-lg font-semibold">คำขอทำข้อมูลนิรนาม</h2><p className="text-sm text-muted-foreground">ทุกคำขอต้องมีผู้สร้างและผู้อนุมัติคนละคน</p></div>
          {permissions.canCreate && <Button variant="outline" asChild><Link href="/members"><ShieldAlert aria-hidden="true" />สร้างจากหน้าสมาชิก</Link></Button>}
        </div>
        <div className="mt-4 max-w-xs"><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-full" aria-label="กรองสถานะคำขอ"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">ทุกสถานะ</SelectItem>{Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="mt-4 overflow-hidden rounded-lg border">
          <Table>
            <TableHeader><TableRow><TableHead>สมาชิก</TableHead><TableHead>สาขา</TableHead><TableHead>ผู้ยื่นคำขอ</TableHead><TableHead>สถานะ</TableHead><TableHead>cleanup</TableHead><TableHead className="text-right">การทำงาน</TableHead></TableRow></TableHeader>
            <TableBody>{filteredRequests.length ? filteredRequests.map((request) => (
              <TableRow key={request.id}>
                <TableCell><div className="font-medium">{request.memberName}</div><div className="text-xs text-muted-foreground tabular-nums">{request.memberCode}</div></TableCell>
                <TableCell>{request.branchName}</TableCell><TableCell><div>{request.requestedByName}</div><div className="text-xs text-muted-foreground tabular-nums">{request.requestedAt ? new Date(request.requestedAt).toLocaleString("th-TH") : "—"}</div></TableCell>
                <TableCell><Badge variant={request.status === "COMPLETED" ? "default" : request.status === "REJECTED" ? "destructive" : "outline"}>{statusLabels[request.status]}</Badge></TableCell>
                <TableCell><span className="tabular-nums">{request.fileCleanupStatus}</span></TableCell>
                <TableCell className="text-right"><div className="flex justify-end gap-2">{request.status === "PENDING" && permissions.canApprove && <Button variant="outline" onClick={() => openReview(request)}>ตรวจคำขอ</Button>}{request.fileCleanupStatus === "FAILED" && permissions.canRetryCleanup && <Button variant="destructive" disabled={pendingAction === `retry-${request.id}`} onClick={() => retryCleanup(request.id)}>{pendingAction === `retry-${request.id}` ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}retry cleanup</Button>}</div></TableCell>
              </TableRow>
            )) : <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">ยังไม่มีคำขอตามตัวกรอง</TableCell></TableRow>}</TableBody>
          </Table>
        </div>
      </section>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>ตรวจคำขอทำข้อมูลนิรนาม</DialogTitle><DialogDescription>การอนุมัติจะลบข้อมูลที่ระบุตัวบุคคลและย้อนกลับไม่ได้ แต่ยังเก็บธุรกรรม บัญชี และใบเสร็จ</DialogDescription></DialogHeader>
          {selected && <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-4"><p className="font-medium">{selected.memberName} · {selected.memberCode}</p><p className="mt-1 text-sm text-muted-foreground">เหตุผล: {selected.reason}</p></div>
            <div><h3 className="font-medium">ข้อมูลที่จะถูกล้าง</h3><ul className="mt-2 grid list-disc gap-1 pl-5 text-sm text-muted-foreground sm:grid-cols-2"><li>ชื่อและข้อมูลติดต่อ</li><li>บัตรประชาชนและที่อยู่</li><li>รูปสมาชิก</li><li>ข้อมูล CRM และการตลาด</li><li>ข้อมูลสุขภาพใน PT</li><li>ข้อความอิสระที่อาจมี PII</li></ul></div>
            <div className="space-y-2"><Label htmlFor="privacy-review-note">หมายเหตุผู้พิจารณา</Label><Input id="privacy-review-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="privacy-confirmation">ข้อความยืนยัน</Label><Input id="privacy-confirmation" autoComplete="off" aria-describedby="privacy-confirmation-help" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /><p id="privacy-confirmation-help" className="text-sm text-muted-foreground">พิมพ์ ANONYMIZE เพื่อเปิดปุ่มอนุมัติ</p></div>
            {feedback?.type === "error" && <PrivacyFeedback {...feedback} />}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>ยกเลิก</Button><Button variant="destructive" disabled={pendingAction !== null} onClick={() => review("REJECTED")}>ปฏิเสธคำขอ</Button><Button disabled={confirmation !== "ANONYMIZE" || pendingAction !== null} onClick={() => review("APPROVED")}>{pendingAction === "APPROVED" && <Loader2 className="animate-spin" aria-hidden="true" />}อนุมัติและทำข้อมูลนิรนาม</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
