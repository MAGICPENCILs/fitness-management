"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MemberCard } from "@/components/members/member-card";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Member } from "@/db/schema";
import { ArrowLeft, Camera, Loader2, Save } from "lucide-react";
import Link from "next/link";
import {
  MemberPrivacyCard,
  type ConsentDisplay,
  type ConsentType,
} from "@/components/privacy/member-privacy-card";
import { MembershipActions } from "@/components/members/membership-actions";

type MemberPackage = {
  id: number;
  packageName: string;
  startDate: Date;
  expireDate: Date;
  status: string;
  paidAmount: number;
};

type CardType = {
  id: number;
  serial: string;
  status: string;
};
const statusLabel: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ACTIVE: { label: "ใช้งาน", variant: "default" },
  EXPIRED: { label: "หมดอายุ", variant: "destructive" },
  FROZEN: { label: "พักใช้งาน", variant: "secondary" },
  SUSPENDED: { label: "ถูกระงับ", variant: "destructive" },
  CANCELLED: { label: "ยกเลิก", variant: "outline" },
};

/** แสดงรายละเอียดสมาชิก แพ็กเกจ บัตร และ consent โดยล็อกฟอร์มเมื่อทำข้อมูลนิรนามแล้ว */
export function MemberDetail({
  member,
  packages,
  assignedCard,
  availableCards,
  privacySnapshot,
  canManagePrivacy,
}: {
  member: Member;
  packages: MemberPackage[];
  assignedCard: CardType | null;
  availableCards: CardType[];
  privacySnapshot: Record<ConsentType, ConsentDisplay | null>;
  canManagePrivacy: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const isAnonymized = member.status === "CANCELLED";
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    member.photoUrl ?? null
  );

  const [form, setForm] = useState({
    firstName: member.firstName,
    lastName: member.lastName,
    phone: member.phone ?? "",
    email: member.email ?? "",
    address: member.address ?? "",
    note: member.note ?? "",
    gender: member.gender ?? "",
    birthDate: member.birthDate
      ? new Date(member.birthDate).toISOString().split("T")[0]
      : "",
  });

  /** อัปเดตค่าฟอร์มเฉพาช่องที่ผู้ใช้แก้ไขโดยไม่แตะค่าอื่น */
  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  /** แสดงรูปใหม่เฉพาะเมื่อ upload mutation สำเร็จ โดยไม่ยิง PATCH ซ้ำหรือเปลี่ยน preview เมื่อผิดพลาด */
  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isAnonymized || photoLoading) return;
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoLoading(true);
    setPhotoError("");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("memberId", String(member.id));
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setPhotoError(typeof data.error === "string" ? data.error : "อัปโหลดรูปไม่สำเร็จ");
        return;
      }
      if (typeof data.url !== "string" || !data.url) throw new Error("INVALID_UPLOAD_RESPONSE");
      setPhotoPreview(data.url);
      router.refresh();
    } catch {
      setPhotoError("อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setPhotoLoading(false);
    }
  };

  /** บันทึกข้อมูลสมาชิกและ refresh เฉพาหลัง request จบลง */
  const handleSave = async () => {
    if (isAnonymized) return;
    setLoading(true);
    try {
      await fetch(`/api/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Back */}
      <Link href="/members"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" />
        กลับหน้าสมาชิก
      </Link>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* LEFT — รูปและรหัส */}
        <div className="max-w-sm space-y-4">
          <button type="button" disabled={isAnonymized || photoLoading} aria-label="อัปโหลดรูปสมาชิก" aria-busy={photoLoading} aria-describedby={photoError ? "member-photo-error" : undefined} className="relative w-full aspect-square rounded-2xl overflow-hidden bg-muted border cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
            onClick={() => fileRef.current?.click()}>
            {photoPreview ? (
              <Image
                src={photoPreview}
                alt={`รูปสมาชิก ${member.firstName} ${member.lastName}`}
                width={512}
                height={512}
                sizes="(min-width: 768px) 33vw, 100vw"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Camera className="w-8 h-8" />
                <span className="text-xs">คลิกเพื่ออัปโหลดรูป</span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 transition flex items-center justify-center">
              <Camera className="w-6 h-6 text-white" />
            </div>
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" aria-label="รูปสมาชิก" aria-describedby={photoError ? "member-photo-error" : undefined} aria-invalid={Boolean(photoError)}
            disabled={isAnonymized || photoLoading} className="hidden" onChange={handlePhoto} />
          {photoError && <p id="member-photo-error" role="alert" className="text-sm text-destructive">{photoError}</p>}

          <div className="text-center space-y-1">
            <div className="font-bold text-lg">{member.memberCode}</div>
            <Badge variant={statusLabel[member.status].variant}>
              {statusLabel[member.status].label}
            </Badge>
          </div>
        </div>

        {/* RIGHT — ฟอร์ม */}
        <div className="space-y-4 md:col-span-2">
          <h1 className="text-xl font-bold">แก้ไขข้อมูลสมาชิก</h1>

          <fieldset disabled={isAnonymized} className="space-y-4">
          <legend className="sr-only">ข้อมูลสมาชิก</legend>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="member-first-name">ชื่อ</Label>
              <Input id="member-first-name" value={form.firstName}
                onChange={(e) => handleChange("firstName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-last-name">นามสกุล</Label>
              <Input id="member-last-name" value={form.lastName}
                onChange={(e) => handleChange("lastName", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="member-phone">เบอร์โทร</Label>
              <Input id="member-phone" type="tel" value={form.phone}
                onChange={(e) => handleChange("phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>เพศ</Label>
              <Select value={form.gender} onValueChange={(v) => handleChange("gender", v)}>
                <SelectTrigger aria-label="เพศ"><SelectValue placeholder="เลือก" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">ชาย</SelectItem>
                  <SelectItem value="FEMALE">หญิง</SelectItem>
                  <SelectItem value="OTHER">อื่นๆ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="member-email">อีเมล</Label>
              <Input id="member-email" type="email" value={form.email}
                onChange={(e) => handleChange("email", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-birth-date">วันเกิด</Label>
              <Input id="member-birth-date" type="date" value={form.birthDate}
                onChange={(e) => handleChange("birthDate", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="member-address">ที่อยู่</Label>
            <Input id="member-address" value={form.address}
              onChange={(e) => handleChange("address", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="member-note">หมายเหตุ</Label>
            <Input id="member-note" value={form.note}
              onChange={(e) => handleChange("note", e.target.value)} />
          </div>

          <Button onClick={handleSave} disabled={loading || isAnonymized} className="gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <Save className="w-4 h-4" />
            บันทึก
          </Button>
          </fieldset>
        </div>
      </div>

      {/* Packages */}
      <div className="space-y-3">
        <h2 className="font-semibold">ประวัติแพ็กเกจ</h2>
        <div className="border rounded-lg divide-y">
          {packages.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              ยังไม่มีแพ็กเกจ
            </div>
          ) : (
            packages.map((pkg) => (
              <div key={pkg.id} className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium">{pkg.packageName}</div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(pkg.startDate).toLocaleDateString("th-TH")} —{" "}
                    {new Date(pkg.expireDate).toLocaleDateString("th-TH")}
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <Badge variant={statusLabel[pkg.status]?.variant ?? "outline"}>
                    {statusLabel[pkg.status]?.label ?? pkg.status}
                  </Badge>
                  <div className="text-sm text-muted-foreground">
                    {Number(pkg.paidAmount).toLocaleString()} บาท
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <MembershipActions
        memberId={member.id}
        memberStatus={member.status}
        activePackageId={packages.find((pkg) => pkg.status === "ACTIVE" || pkg.status === "FROZEN")?.id ?? null}
      />
      {/* Card */}
      <MemberCard
        memberId={member.id}
        assignedCard={assignedCard}
        availableCards={availableCards}
      />
      <MemberPrivacyCard
        memberId={member.id}
        snapshot={privacySnapshot}
        canManage={canManagePrivacy}
        anonymized={isAnonymized}
      />
    </div>
  );
}
