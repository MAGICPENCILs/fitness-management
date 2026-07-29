"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CircleDollarSign,
  Gift,
  HeartHandshake,
  MessageSquareText,
  Pencil,
  Plus,
  UserRoundX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
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

type Member = {
  id: number;
  memberCode: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  interests: string | null;
  fitnessGoals: string | null;
  preferredContact: "PHONE" | "LINE" | "SMS" | "EMAIL" | "NONE";
  points: number;
  lastVisit: string | null;
  isInactive: boolean;
};

type Interaction = {
  id: number;
  memberId: number;
  memberCode: string;
  firstName: string;
  lastName: string;
  channel: "NOTE" | "PHONE" | "LINE" | "SMS" | "EMAIL" | "IN_PERSON";
  summary: string;
  followUpDate: string | null;
  createdAt: string | null;
};

type Reward = {
  id: number;
  name: string;
  description: string | null;
  pointsRequired: number;
  stock: number | null;
};

type DialogState =
  | { type: "profile" | "interaction" | "points" | "redeem"; member: Member }
  | { type: "reward" }
  | null;

const contactLabels = {
  PHONE: "โทรศัพท์",
  LINE: "LINE",
  SMS: "SMS",
  EMAIL: "อีเมล",
  NONE: "ไม่ระบุ",
} as const;

const channelLabels = {
  NOTE: "บันทึกทั่วไป",
  PHONE: "โทรศัพท์",
  LINE: "LINE",
  SMS: "SMS",
  EMAIL: "อีเมล",
  IN_PERSON: "พูดคุยที่สาขา",
} as const;

/** แสดงวันที่แบบไทยและใช้ข้อความสำรองเมื่อยังไม่เคยเข้าใช้บริการ */
function formatDate(value: string | null) {
  if (!value) return "ยังไม่เคยเข้าใช้";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

/** แสดงชื่อเต็มพร้อมรหัสเพื่อแยกสมาชิกชื่อซ้ำได้ชัดเจน */
function memberName(member: Pick<Member, "memberCode" | "firstName" | "lastName">) {
  return `${member.firstName} ${member.lastName} (${member.memberCode})`;
}

/** จัดการหน้า CRM ฝั่ง client รวม dialog, feedback และการ refresh ข้อมูลหลัง mutation */
export function CrmManager({
  members,
  interactions,
  rewards,
  summary,
}: {
  members: Member[];
  interactions: Interaction[];
  rewards: Reward[];
  summary: {
    profiledMembers: number;
    openFollowUps: number;
    outstandingPoints: number;
    inactiveMembers: number;
  };
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const inactiveMembers = members.filter((member) => member.isInactive);

  /** เปิด dialog ใหม่พร้อมล้าง feedback จากการทำรายการก่อนหน้า */
  function openDialog(nextDialog: NonNullable<DialogState>) {
    setError("");
    setMessage("");
    setDialog(nextDialog);
  }

  /** เรียก API mutation แบบมาตรฐานและโหลด Server Component ใหม่เมื่อสำเร็จ */
  async function runAction(path: string, body?: unknown, closeOnSuccess = true) {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "ทำรายการไม่สำเร็จ");
      setMessage(result.message || "บันทึกข้อมูลแล้ว");
      if (closeOnSuccess) setDialog(null);
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }

  /** ส่งฟอร์มความสนใจและเป้าหมายของสมาชิกไปยังโปรไฟล์ CRM */
  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || dialog.type !== "profile") return;
    const data = new FormData(event.currentTarget);
    await runAction("/api/crm/profiles", {
      memberId: dialog.member.id,
      interests: data.get("interests"),
      fitnessGoals: data.get("fitnessGoals"),
      preferredContact: data.get("preferredContact"),
    });
  }

  /** ส่งบันทึกการสื่อสารและวันติดตามถัดไปของสมาชิก */
  async function handleInteractionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || dialog.type !== "interaction") return;
    const data = new FormData(event.currentTarget);
    await runAction("/api/crm/interactions", {
      memberId: dialog.member.id,
      channel: data.get("channel"),
      summary: data.get("summary"),
      followUpDate: data.get("followUpDate"),
    });
  }

  /** ส่งรายการเพิ่มคะแนนพร้อมที่มาเพื่อคง audit trail ใน ledger */
  async function handlePointsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || dialog.type !== "points") return;
    const data = new FormData(event.currentTarget);
    await runAction("/api/loyalty/points", {
      memberId: dialog.member.id,
      points: data.get("points"),
      source: data.get("source"),
      note: data.get("note"),
    });
  }

  /** ส่งข้อมูลของรางวัลใหม่ โดยปล่อยสต็อกว่างได้เมื่อไม่จำกัดจำนวน */
  async function handleRewardSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await runAction("/api/loyalty/rewards", {
      name: data.get("name"),
      description: data.get("description"),
      pointsRequired: data.get("pointsRequired"),
      stock: data.get("stock"),
    });
  }

  /** ส่งคำขอแลกรางวัลของสมาชิกที่เลือกให้ service ตรวจคะแนนและสต็อกซ้ำใน transaction */
  async function handleRedeemSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || dialog.type !== "redeem") return;
    const data = new FormData(event.currentTarget);
    await runAction(`/api/loyalty/rewards/${data.get("rewardId")}/redeem`, {
      memberId: dialog.member.id,
    });
  }

  /** ปิดงานติดตามจากตารางโดยคง dialog ปัจจุบันไว้และแสดง feedback บนหน้า */
  async function handleCompleteInteraction(interactionId: number) {
    await runAction(`/api/crm/interactions/${interactionId}/complete`, undefined, false);
  }

  return (
    <div className="flex flex-col gap-8">
      <div aria-live="polite" className="min-h-0">
        {message && (
          <p className="rounded-lg border border-success/30 bg-success-surface px-4 py-3 text-sm text-success">
            {message}
          </p>
        )}
        {error && !dialog && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <section aria-label="สรุป CRM" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="มีโปรไฟล์ CRM" value={summary.profiledMembers.toLocaleString("th-TH")} icon={HeartHandshake} tone="primary" />
        <StatCard label="งานติดตามที่เปิด" value={summary.openFollowUps.toLocaleString("th-TH")} icon={MessageSquareText} tone="info" />
        <StatCard label="คะแนนคงค้างรวม" value={summary.outstandingPoints.toLocaleString("th-TH")} icon={CircleDollarSign} tone="success" />
        <StatCard label="Inactive เกิน 30 วัน" value={summary.inactiveMembers.toLocaleString("th-TH")} icon={UserRoundX} tone="warning" />
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">สมาชิกและคะแนนสะสม</h2>
            <p className="text-sm text-muted-foreground">จัดการความสนใจ การติดตาม คะแนน และการแลกรางวัลรายสมาชิก</p>
          </div>
          <Button onClick={() => openDialog({ type: "reward" })}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            เพิ่มของรางวัล
          </Button>
        </div>
        {members.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 p-6 text-center">
            <HeartHandshake className="size-10 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">ยังไม่มีสมาชิกที่ใช้งานอยู่</p>
            <p className="text-sm text-muted-foreground">เพิ่มสมาชิกก่อนเริ่มบันทึก CRM และคะแนนสะสม</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>สมาชิก</TableHead>
                  <TableHead>ความสนใจ / เป้าหมาย</TableHead>
                  <TableHead>ช่องทางหลัก</TableHead>
                  <TableHead>เข้าใช้ล่าสุด</TableHead>
                  <TableHead className="text-right">คะแนน</TableHead>
                  <TableHead className="min-w-80 text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <p className="font-medium">{member.firstName} {member.lastName}</p>
                      <p className="text-xs text-muted-foreground">{member.memberCode}</p>
                    </TableCell>
                    <TableCell className="max-w-64">
                      <p className="truncate text-sm">{member.interests || "ยังไม่ระบุความสนใจ"}</p>
                      <p className="truncate text-xs text-muted-foreground">{member.fitnessGoals || "ยังไม่ระบุเป้าหมาย"}</p>
                    </TableCell>
                    <TableCell>{contactLabels[member.preferredContact]}</TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-sm tabular-nums">{formatDate(member.lastVisit)}</span>
                        {member.isInactive && <Badge variant="outline">Inactive</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{member.points.toLocaleString("th-TH")}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openDialog({ type: "profile", member })}>
                          <Pencil data-icon="inline-start" aria-hidden="true" />CRM
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openDialog({ type: "interaction", member })}>ติดตาม</Button>
                        <Button variant="secondary" size="sm" onClick={() => openDialog({ type: "points", member })}>+ คะแนน</Button>
                        <Button size="sm" disabled={rewards.length === 0} onClick={() => openDialog({ type: "redeem", member })}>แลก</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="border-b p-5">
            <h2 className="text-lg font-semibold">งานติดตามที่เปิดอยู่</h2>
            <p className="text-sm text-muted-foreground">ปิดงานเมื่อพนักงานติดต่อหรือดำเนินการเรียบร้อยแล้ว</p>
          </div>
          {interactions.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">ยังไม่มีงานติดตามที่เปิดอยู่</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>สมาชิก</TableHead><TableHead>รายละเอียด</TableHead><TableHead>นัดถัดไป</TableHead><TableHead className="text-right">สถานะ</TableHead></TableRow></TableHeader>
                <TableBody>
                  {interactions.map((interaction) => (
                    <TableRow key={interaction.id}>
                      <TableCell><p className="font-medium">{interaction.firstName} {interaction.lastName}</p><p className="text-xs text-muted-foreground">{interaction.memberCode}</p></TableCell>
                      <TableCell className="max-w-64"><Badge variant="secondary">{channelLabels[interaction.channel]}</Badge><p className="mt-2 text-sm text-pretty">{interaction.summary}</p></TableCell>
                      <TableCell className="tabular-nums">{interaction.followUpDate ? formatDate(interaction.followUpDate) : "ไม่กำหนด"}</TableCell>
                      <TableCell className="text-right"><Button variant="outline" size="sm" disabled={pending} onClick={() => handleCompleteInteraction(interaction.id)}><Check data-icon="inline-start" aria-hidden="true" />ปิดงาน</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card shadow-sm">
          <div className="border-b p-5">
            <h2 className="text-lg font-semibold">ของรางวัลที่เปิดแลก</h2>
            <p className="text-sm text-muted-foreground">สต็อกว่างหมายถึงสามารถแลกได้ไม่จำกัดจำนวน</p>
          </div>
          {rewards.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">ยังไม่มีของรางวัล กด “เพิ่มของรางวัล” เพื่อเริ่มต้น</p>
          ) : (
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {rewards.map((reward) => (
                <article key={reward.id} className="rounded-xl border bg-muted/30 p-4">
                  <div className="flex items-start justify-between gap-3"><Gift className="size-5 text-primary" aria-hidden="true" /><Badge>{reward.pointsRequired.toLocaleString("th-TH")} คะแนน</Badge></div>
                  <h3 className="mt-3 font-semibold">{reward.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{reward.description || "ไม่มีรายละเอียดเพิ่มเติม"}</p>
                  <p className="mt-3 text-xs text-muted-foreground">คงเหลือ: {reward.stock === null ? "ไม่จำกัด" : reward.stock.toLocaleString("th-TH")}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b p-5"><h2 className="text-lg font-semibold">สมาชิก Inactive</h2><p className="text-sm text-muted-foreground">สมาชิกที่ไม่มีการเข้าใช้สำเร็จเกิน 30 วัน เหมาะสำหรับวางแผนติดตามกลับมาใช้บริการ</p></div>
        {inactiveMembers.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">ไม่มีสมาชิกที่เข้าเกณฑ์ inactive ในขณะนี้</p>
        ) : (
          <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>สมาชิก</TableHead><TableHead>ติดต่อ</TableHead><TableHead>เข้าใช้ล่าสุด</TableHead><TableHead className="text-right">การติดตาม</TableHead></TableRow></TableHeader><TableBody>{inactiveMembers.map((member) => <TableRow key={member.id}><TableCell><p className="font-medium">{member.firstName} {member.lastName}</p><p className="text-xs text-muted-foreground">{member.memberCode}</p></TableCell><TableCell>{member.phone || member.email || "ไม่มีข้อมูลติดต่อ"}</TableCell><TableCell className="tabular-nums">{formatDate(member.lastVisit)}</TableCell><TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => openDialog({ type: "interaction", member })}>สร้างงานติดตาม</Button></TableCell></TableRow>)}</TableBody></Table></div>
        )}
      </section>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          {dialog?.type === "profile" && <form onSubmit={handleProfileSubmit} className="flex flex-col gap-5"><DialogHeader><DialogTitle>โปรไฟล์ CRM</DialogTitle><DialogDescription>{memberName(dialog.member)} — บันทึกข้อมูลที่ช่วยให้พนักงานดูแลได้ตรงความสนใจ</DialogDescription></DialogHeader><div className="flex flex-col gap-2"><Label htmlFor="interests">ความสนใจ</Label><Input id="interests" name="interests" defaultValue={dialog.member.interests ?? ""} placeholder="เช่น เวทเทรนนิ่ง วิ่ง โยคะ" maxLength={500} /></div><div className="flex flex-col gap-2"><Label htmlFor="fitnessGoals">เป้าหมายการออกกำลังกาย</Label><Input id="fitnessGoals" name="fitnessGoals" defaultValue={dialog.member.fitnessGoals ?? ""} placeholder="เช่น ลดไขมัน 5 กก. ภายใน 3 เดือน" maxLength={500} /></div><div className="flex flex-col gap-2"><Label htmlFor="preferredContact">ช่องทางติดต่อที่ต้องการ</Label><Select name="preferredContact" defaultValue={dialog.member.preferredContact}><SelectTrigger id="preferredContact" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{Object.entries(contactLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></div><DialogFeedback error={error} /><Button type="submit" disabled={pending}>{pending ? "กำลังบันทึก..." : "บันทึกโปรไฟล์"}</Button></form>}

          {dialog?.type === "interaction" && <form onSubmit={handleInteractionSubmit} className="flex flex-col gap-5"><DialogHeader><DialogTitle>บันทึกการติดตาม</DialogTitle><DialogDescription>{memberName(dialog.member)} — ระบุสิ่งที่ติดต่อและวันดำเนินการถัดไป</DialogDescription></DialogHeader><div className="flex flex-col gap-2"><Label htmlFor="channel">ช่องทาง</Label><Select name="channel" defaultValue="PHONE"><SelectTrigger id="channel" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{Object.entries(channelLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></div><div className="flex flex-col gap-2"><Label htmlFor="summary">รายละเอียด *</Label><Input id="summary" name="summary" required minLength={2} maxLength={1000} placeholder="สรุปสิ่งที่พูดคุยหรือสิ่งที่ต้องดำเนินการ" /></div><div className="flex flex-col gap-2"><Label htmlFor="followUpDate">วันติดตามถัดไป</Label><Input id="followUpDate" name="followUpDate" type="date" /></div><DialogFeedback error={error} /><Button type="submit" disabled={pending}>{pending ? "กำลังบันทึก..." : "บันทึกการติดตาม"}</Button></form>}

          {dialog?.type === "points" && <form onSubmit={handlePointsSubmit} className="flex flex-col gap-5"><DialogHeader><DialogTitle>เพิ่มคะแนนสะสม</DialogTitle><DialogDescription>{memberName(dialog.member)} — คะแนนปัจจุบัน {dialog.member.points.toLocaleString("th-TH")} คะแนน</DialogDescription></DialogHeader><div className="flex flex-col gap-2"><Label htmlFor="points">จำนวนคะแนน *</Label><Input id="points" name="points" type="number" inputMode="numeric" required min={1} max={1000000} /></div><div className="flex flex-col gap-2"><Label htmlFor="source">ที่มาของคะแนน *</Label><Input id="source" name="source" required minLength={2} maxLength={120} placeholder="เช่น ต่ออายุสมาชิกรายปี" /></div><div className="flex flex-col gap-2"><Label htmlFor="pointNote">หมายเหตุ</Label><Input id="pointNote" name="note" maxLength={500} /></div><DialogFeedback error={error} /><Button type="submit" disabled={pending}>{pending ? "กำลังเพิ่มคะแนน..." : "ยืนยันเพิ่มคะแนน"}</Button></form>}

          {dialog?.type === "reward" && <form onSubmit={handleRewardSubmit} className="flex flex-col gap-5"><DialogHeader><DialogTitle>เพิ่มของรางวัล</DialogTitle><DialogDescription>กำหนดคะแนนที่ใช้แลกและสต็อก หากไม่จำกัดจำนวนให้เว้นสต็อกว่าง</DialogDescription></DialogHeader><div className="flex flex-col gap-2"><Label htmlFor="rewardName">ชื่อรางวัล *</Label><Input id="rewardName" name="name" required minLength={2} maxLength={150} placeholder="เช่น เครื่องดื่มโปรตีน 1 ขวด" /></div><div className="flex flex-col gap-2"><Label htmlFor="description">รายละเอียด</Label><Input id="description" name="description" maxLength={1000} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="flex flex-col gap-2"><Label htmlFor="pointsRequired">คะแนนที่ใช้ *</Label><Input id="pointsRequired" name="pointsRequired" type="number" inputMode="numeric" required min={1} max={1000000} /></div><div className="flex flex-col gap-2"><Label htmlFor="stock">สต็อก</Label><Input id="stock" name="stock" type="number" inputMode="numeric" min={0} max={1000000} /></div></div><DialogFeedback error={error} /><Button type="submit" disabled={pending}>{pending ? "กำลังสร้าง..." : "สร้างของรางวัล"}</Button></form>}

          {dialog?.type === "redeem" && <form onSubmit={handleRedeemSubmit} className="flex flex-col gap-5"><DialogHeader><DialogTitle>แลกคะแนน</DialogTitle><DialogDescription>{memberName(dialog.member)} — มี {dialog.member.points.toLocaleString("th-TH")} คะแนน ระบบจะตรวจยอดและสต็อกอีกครั้งก่อนยืนยัน</DialogDescription></DialogHeader><div className="flex flex-col gap-2"><Label htmlFor="rewardId">ของรางวัล *</Label><Select name="rewardId" required><SelectTrigger id="rewardId" className="w-full"><SelectValue placeholder="เลือกของรางวัล" /></SelectTrigger><SelectContent><SelectGroup>{rewards.map((reward) => <SelectItem key={reward.id} value={String(reward.id)} disabled={reward.stock === 0}>{reward.name} — {reward.pointsRequired.toLocaleString("th-TH")} คะแนน</SelectItem>)}</SelectGroup></SelectContent></Select></div><DialogFeedback error={error} /><Button type="submit" disabled={pending}>{pending ? "กำลังแลก..." : "ยืนยันแลกรางวัล"}</Button></form>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** แสดงข้อผิดพลาดของ dialog ในตำแหน่งที่ screen reader ประกาศได้ทันที */
function DialogFeedback({ error }: { error: string }) {
  if (!error) return null;
  return <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>;
}
