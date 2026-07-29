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
    });

    const handleChange = (field: string, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    };

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

    // เมื่อเลือก package ให้ auto-fill ราคา
    const handlePackageChange = (packageId: string) => {
        const pkg = packages.find((p) => String(p.id) === packageId);
        setForm((prev) => ({
            ...prev,
            packageId,
            paidAmount: pkg ? String(pkg.price) : "",
        }));
    };

    const handleSubmit = async () => {
        setError("");
        if (!form.memberCode || !form.firstName || !form.lastName) {
            setError("กรุณากรอกรหัสสมาชิก ชื่อ และนามสกุล");
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
                    note:     form.note 
                }),
            });

            if (!memberRes.ok) throw new Error("สร้างสมาชิกไม่สำเร็จ");
            const memberData = await memberRes.json();

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

            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>เพิ่มสมาชิกใหม่</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* รหัสสมาชิก */}
                    <div className="space-y-1.5">
                        <Label>รหัสสมาชิก</Label>
                        <Input value={form.memberCode} readOnly className="bg-muted cursor-not-allowed" />
                    </div>

                    {/* ชื่อ - นามสกุล */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>ชื่อ <span className="text-destructive">*</span></Label>
                            <Input placeholder="สมชาย" value={form.firstName}
                                onChange={(e) => handleChange("firstName", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>นามสกุล <span className="text-destructive">*</span></Label>
                            <Input placeholder="ใจดี" value={form.lastName}
                                onChange={(e) => handleChange("lastName", e.target.value)} />
                        </div>
                    </div>

                    {/* เบอร์โทร + เพศ */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>เบอร์โทร</Label>
                            <Input placeholder="0812345678" value={form.phone}
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

                    {/* อีเมล */}
                    <div className="space-y-1.5">
                        <Label>อีเมล</Label>
                        <Input placeholder="email@example.com" value={form.email}
                            onChange={(e) => handleChange("email", e.target.value)} />
                    </div>

                    {/* ที่อยู่ */}
                    <div className="space-y-1.5">
                        <Label>ที่อยู่</Label>
                        <Input placeholder="บ้านเลขที่ ถนน ตำบล อำเภอ จังหวัด"
                            value={form.address}
                            onChange={(e) => handleChange("address", e.target.value)} />
                    </div>

                    {/* หมายเหตุ */}
                    <div className="space-y-1.5">
                        <Label>หมายเหตุ</Label>
                        <Input placeholder="หมายเหตุเพิ่มเติม"
                            value={form.note}
                            onChange={(e) => handleChange("note", e.target.value)} />
                    </div>

                    {/* เลขบัตรประชาชน + วันเกิด */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>เลขบัตรประชาชน</Label>
                            <Input placeholder="1234567890123" maxLength={13} value={form.idCard}
                                onChange={(e) => handleChange("idCard", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>วันเกิด</Label>
                            <Input type="date" value={form.birthDate}
                                onChange={(e) => handleChange("birthDate", e.target.value)} />
                        </div>
                    </div>
                    {/* แพ็กเกจ */}
                    <div className="space-y-1.5">
                        <Label>แพ็กเกจ</Label>
                        <Select value={form.packageId} onValueChange={handlePackageChange}>
                            <SelectTrigger><SelectValue placeholder="เลือกแพ็กเกจ" /></SelectTrigger>
                            <SelectContent>
                                {packages.map((pkg) => (
                                    <SelectItem key={pkg.id} value={String(pkg.id)}>
                                        {pkg.name} — {Number(pkg.price).toLocaleString()} บาท ({pkg.durationDays} วัน)
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* วันเริ่ม + ราคา */}
                    {form.packageId && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>วันเริ่มต้น</Label>
                                <Input type="date" value={form.startDate}
                                    onChange={(e) => handleChange("startDate", e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>ราคาที่ชำระ (บาท)</Label>
                                <Input type="number" value={form.paidAmount}
                                    onChange={(e) => handleChange("paidAmount", e.target.value)} />
                            </div>
                        </div>
                    )}

                    {/* แสดง expire date */}
                    {selectedPkg && form.startDate && (
                        <div className="rounded-lg p-3 text-sm"
                            style={{ background: "#ede9fe", color: "#4f46e5" }}>
                            วันหมดอายุ: {(() => {
                                const d = new Date(form.startDate);
                                d.setDate(d.getDate() + selectedPkg.durationDays);
                                return d.toLocaleDateString("th-TH", {
                                    year: "numeric", month: "long", day: "numeric"
                                });
                            })()}
                        </div>
                    )}

                    {error && <p className="text-sm text-destructive">{error}</p>}

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