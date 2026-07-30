"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog, DialogContent, DialogHeader,
    DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UserPlus, Loader2 } from "lucide-react";

type Package = {
    id: number;
    name: string;
    type: string;
    durationDays: number;
    price: string;
};

/** สร้างสมาชิกพร้อม consent ledger แรกเริ่ม โดยบังคับ service privacy แต่ไม่บังคับ marketing หรือ photo */
export function AddMemberDialog() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [packages, setPackages] = useState<Package[]>([]);

    const [form, setForm] = useState({
        memberCode: "",
        firstName: "",
        lastName: "",
        idCard: "",
        phone: "",
        email: "",
        gender: "",
        birthDate: "",
        packageId: "",
        startDate: new Date().toISOString().split("T")[0],
        paidAmount: "",
        address: "",
        note: "",
        servicePrivacy: false,
        marketingConsent: false,
        photoConsent: false,
    });

    /** อัปเดตค่าฟอร์มเฉพาช่องที่เปลี่ยนเพื่อรักษาค่าอื่นไว้ */
    const handleChange = (field: string, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    /** โหลดรหัสถัดไปและแพ็กเกจเฉพาะเมื่อเปิด dialog เพื่อลด request ที่ไม่จำเป็น */
    const handleOpenChange = async (val: boolean) => {
        setOpen(val);
        if (val) {
            // ดึง next code
            const codeRes = await fetch("/api/members/next-code");
            const codeData = await codeRes.json();
            // ดึง packages
            const pkgRes = await fetch("/api/packages");
            const pkgData = await pkgRes.json();
            setPackages(pkgData);
            setForm((prev) => ({ ...prev, memberCode: codeData.code }));
        }
    };

    /** เติมราคาอัตโนมัติจากแพ็กเกจที่เลือก โดยยังเปิดให้พนักงานแก้ราคาชำระได้ */
    const handlePackageChange = (packageId: string) => {
        const pkg = packages.find((p) => String(p.id) === packageId);
        setForm((prev) => ({
            ...prev,
            packageId,
            paidAmount: pkg ? String(pkg.price) : "",
        }));
    };

    /** สร้างสมาชิกก่อนผูกแพ็กเกจ และไม่ refresh หากขั้นใดขั้นหนึ่งล้มเหลว */
    const handleSubmit = async () => {
        setError("");
        if (!form.memberCode || !form.firstName || !form.lastName) {
            setError("กรุณากรอกรหัสสมาชิก ชื่อ และนามสกุล");
            return;
        }
        if (!form.servicePrivacy) {
            setError("ต้องได้รับความยินยอมเพื่อให้บริการก่อนสมัครสมาชิก");
            return;
        }

        setLoading(true);
        try {
            // 1. สร้างสมาชิก
            const memberRes = await fetch("/api/members", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    memberCode: form.memberCode,
                    firstName: form.firstName,
                    lastName: form.lastName,
                    idCard: form.idCard || undefined,
                    phone: form.phone || undefined,
                    email: form.email || undefined,
                    gender: form.gender || undefined,
                    birthDate: form.birthDate || undefined,
                    address: form.address || undefined,
                    note: form.note,
                    consents: {
                        servicePrivacy: form.servicePrivacy,
                        marketing: form.marketingConsent,
                        photo: form.photoConsent,
                        policyVersion: "2026-01",
                    },
                }),
            });

            const memberData = await memberRes.json();
            if (!memberRes.ok) throw new Error(memberData.error ?? "สร้างสมาชิกไม่สำเร็จ");

            // 2. ผูก package (ถ้าเลือก)
            if (form.packageId) {
                const pkgRes = await fetch("/api/member-packages", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        memberId: memberData.id,
                        packageId: Number(form.packageId),
                        startDate: form.startDate,
                        paidAmount: Number(form.paidAmount),
                    }),
                });
                if (!pkgRes.ok) throw new Error("ผูกแพ็กเกจไม่สำเร็จ");
            }

            setOpen(false);
            router.refresh();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
        } finally {
            setLoading(false);
        }
    };

    const selectedPkg = packages.find((p) => String(p.id) === form.packageId);

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button className="gap-2">
                    <UserPlus className="w-4 h-4" />
                    เพิ่มสมาชิก
                </Button>
            </DialogTrigger>

            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>เพิ่มสมาชิกใหม่</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* รหัสสมาชิก */}
                    <div className="space-y-1.5">
                        <Label htmlFor="new-member-code">รหัสสมาชิก</Label>
                        <Input id="new-member-code" value={form.memberCode} readOnly className="bg-muted cursor-not-allowed" />
                    </div>

                    {/* ชื่อ - นามสกุล */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="new-member-first-name">ชื่อ <span className="text-destructive">*</span></Label>
                            <Input id="new-member-first-name" required placeholder="สมชาย" value={form.firstName}
                                onChange={(e) => handleChange("firstName", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="new-member-last-name">นามสกุล <span className="text-destructive">*</span></Label>
                            <Input id="new-member-last-name" required placeholder="ใจดี" value={form.lastName}
                                onChange={(e) => handleChange("lastName", e.target.value)} />
                        </div>
                    </div>

                    {/* เบอร์โทร + เพศ */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="new-member-phone">เบอร์โทร</Label>
                            <Input id="new-member-phone" type="tel" placeholder="0812345678" value={form.phone}
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

                    {/* อีเมล */}
                    <div className="space-y-1.5">
                        <Label htmlFor="new-member-email">อีเมล</Label>
                        <Input id="new-member-email" type="email" placeholder="email@example.com" value={form.email}
                            onChange={(e) => handleChange("email", e.target.value)} />
                    </div>

                    {/* ที่อยู่ */}
                    <div className="space-y-1.5">
                        <Label htmlFor="new-member-address">ที่อยู่</Label>
                        <Input id="new-member-address" placeholder="บ้านเลขที่ ถนน ตำบล อำเภอ จังหวัด"
                            value={form.address}
                            onChange={(e) => handleChange("address", e.target.value)} />
                    </div>

                    {/* หมายเหตุ */}
                    <div className="space-y-1.5">
                        <Label htmlFor="new-member-note">หมายเหตุ</Label>
                        <Input id="new-member-note" placeholder="หมายเหตุเพิ่มเติม"
                            value={form.note}
                            onChange={(e) => handleChange("note", e.target.value)} />
                    </div>

                    {/* เลขบัตรประชาชน + วันเกิด */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="new-member-id-card">เลขบัตรประชาชน</Label>
                            <Input id="new-member-id-card" inputMode="numeric" placeholder="1234567890123" maxLength={13} value={form.idCard}
                                onChange={(e) => handleChange("idCard", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="new-member-birth-date">วันเกิด</Label>
                            <Input id="new-member-birth-date" type="date" value={form.birthDate}
                                onChange={(e) => handleChange("birthDate", e.target.value)} />
                        </div>
                    </div>
                    {/* แพ็กเกจ */}
                    <div className="space-y-1.5">
                        <Label>แพ็กเกจ</Label>
                        <Select value={form.packageId} onValueChange={handlePackageChange}>
                            <SelectTrigger aria-label="แพ็กเกจ"><SelectValue placeholder="เลือกแพ็กเกจ" /></SelectTrigger>
                            <SelectContent>
                                {packages.map((pkg) => (
                                    <SelectItem key={pkg.id} value={String(pkg.id)}>
                                        {pkg.name} — {Number(pkg.price).toLocaleString()} บาท ({pkg.durationDays} วัน)
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <fieldset className="space-y-3 rounded-lg border bg-muted/30 p-4">
                        <legend className="px-1 font-medium">ความยินยอม PDPA</legend>
                        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
                            <input type="checkbox" required checked={form.servicePrivacy} onChange={(event) => setForm((prev) => ({ ...prev, servicePrivacy: event.target.checked }))} className="mt-1 size-4 accent-primary" />
                            <span><span className="font-medium">การใช้ข้อมูลเพื่อให้บริการ *</span><span className="block text-muted-foreground">จำเป็นต่อการสมัครและเข้าใช้บริการ</span></span>
                        </label>
                        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
                            <input type="checkbox" checked={form.marketingConsent} onChange={(event) => setForm((prev) => ({ ...prev, marketingConsent: event.target.checked }))} className="mt-1 size-4 accent-primary" />
                            <span><span className="font-medium">การตลาด</span><span className="block text-muted-foreground">รับข่าวสารและโปรโมชัน</span></span>
                        </label>
                        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
                            <input type="checkbox" checked={form.photoConsent} onChange={(event) => setForm((prev) => ({ ...prev, photoConsent: event.target.checked }))} className="mt-1 size-4 accent-primary" />
                            <span><span className="font-medium">รูปถ่ายสมาชิก</span><span className="block text-muted-foreground">อนุญาตให้เก็บรูปสำหรับการตรวจสอบหน้าสาขา</span></span>
                        </label>
                    </fieldset>

                    {/* วันเริ่ม + ราคา */}
                    {form.packageId && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="new-member-start-date">วันเริ่มต้น</Label>
                                <Input id="new-member-start-date" type="date" value={form.startDate}
                                    onChange={(e) => handleChange("startDate", e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="new-member-paid-amount">ราคาที่ชำระ (บาท)</Label>
                                <Input id="new-member-paid-amount" type="number" value={form.paidAmount}
                                    onChange={(e) => handleChange("paidAmount", e.target.value)} />
                            </div>
                        </div>
                    )}

                    {/* แสดง expire date */}
                    {selectedPkg && form.startDate && (
                          <div className="rounded-lg bg-accent p-3 text-sm text-accent-foreground">
                            วันหมดอายุ: {(() => {
                                const d = new Date(form.startDate);
                                d.setDate(d.getDate() + selectedPkg.durationDays);
                                return d.toLocaleDateString("th-TH", {
                                    year: "numeric", month: "long", day: "numeric"
                                });
                            })()}
                        </div>
                    )}

                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
                        <Button onClick={handleSubmit} disabled={loading} className="gap-2">
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            บันทึก
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
