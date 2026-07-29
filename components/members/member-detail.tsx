"use client";

import { useState, useRef } from "react";
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

export function MemberDetail({
  member,
  packages,
  assignedCard,
  availableCards,
}: {
  member: Member;
  packages: MemberPackage[];
  assignedCard: CardType | null;
  availableCards: CardType[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
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

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);

    // Upload
    const formData = new FormData();
    formData.append("file", file);
    formData.append("memberCode", member.memberCode);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();

    // บันทึก path ลง DB
    await fetch(`/api/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoUrl: data.url }),
    });
  };

  const handleSave = async () => {
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
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Back */}
      <Link href="/members"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" />
        กลับหน้าสมาชิก
      </Link>

      <div className="grid grid-cols-3 gap-6">
        {/* LEFT — รูปและรหัส */}
        <div className="space-y-4">
          <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-muted border cursor-pointer"
            onClick={() => fileRef.current?.click()}>
            {photoPreview ? (
              <img src={photoPreview} alt="photo"
                className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Camera className="w-8 h-8" />
                <span className="text-xs">คลิกเพื่ออัปโหลดรูป</span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 transition flex items-center justify-center">
              <Camera className="w-6 h-6 text-white" />
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*"
            className="hidden" onChange={handlePhoto} />

          <div className="text-center space-y-1">
            <div className="font-bold text-lg">{member.memberCode}</div>
            <Badge variant={statusLabel[member.status].variant}>
              {statusLabel[member.status].label}
            </Badge>
          </div>
        </div>

        {/* RIGHT — ฟอร์ม */}
        <div className="col-span-2 space-y-4">
          <h1 className="text-xl font-bold">แก้ไขข้อมูลสมาชิก</h1>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>ชื่อ</Label>
              <Input value={form.firstName}
                onChange={(e) => handleChange("firstName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>นามสกุล</Label>
              <Input value={form.lastName}
                onChange={(e) => handleChange("lastName", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>เบอร์โทร</Label>
              <Input value={form.phone}
                onChange={(e) => handleChange("phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>เพศ</Label>
              <Select value={form.gender} onValueChange={(v) => handleChange("gender", v)}>
                <SelectTrigger><SelectValue placeholder="เลือก" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">ชาย</SelectItem>
                  <SelectItem value="FEMALE">หญิง</SelectItem>
                  <SelectItem value="OTHER">อื่นๆ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>อีเมล</Label>
              <Input value={form.email}
                onChange={(e) => handleChange("email", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>วันเกิด</Label>
              <Input type="date" value={form.birthDate}
                onChange={(e) => handleChange("birthDate", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>ที่อยู่</Label>
            <Input value={form.address}
              onChange={(e) => handleChange("address", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>หมายเหตุ</Label>
            <Input value={form.note}
              onChange={(e) => handleChange("note", e.target.value)} />
          </div>

          <Button onClick={handleSave} disabled={loading} className="gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <Save className="w-4 h-4" />
            บันทึก
          </Button>
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
      {/* Card */}
      <MemberCard
        memberId={member.id}
        assignedCard={assignedCard}
        availableCards={availableCards}
      />
    </div>
  );
}