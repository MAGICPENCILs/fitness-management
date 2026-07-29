"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Receipt } from "lucide-react";

type Member = {
    id: number;
    memberCode: string;
    firstName: string;
    lastName: string;
};

type Package = {
    id: number;
    name: string;
    durationDays: number;
    price: string;
    type: string;
}; 

type Promotion = {
    id: number;
    name: string;
    type: string;
    value: string;
    startDate: Date;
    endDate: Date;
};

const methodLabel: Record<string, string> = {
    CASH: "เงินสด",
    QR_PROMPTPAY: "QR Promptpay",
    TRANSFER: "โอนเงิน",
    CREDIT_CARD: "บัตรเครดิต/เดบิต",
};

export function PaymentForm({
    members,
    packages,
    promotions=[],
}: {
    members: Member[];
    packages: Package[];
    promotions?: Promotion[];
}) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [promotionId, setPromotionId] = useState("");

    const [form, setForm] = useState({
        memberId: "",
        packageId: "",
        amount: "",
        method: "",
        note: "",
        startDate: new Date().toISOString().split("T")[0],
    });

    // เพิ่ม state
    const [search, setSearch] = useState("");
    const handleSearchOrScan = async (value: string) => {
        setSearch(value);
        // ค้นหาจาก memberCode หรือ serial บัตร
        const found = members.find(
            (m) => m.memberCode.toLowerCase() === value.toLowerCase()
        );
        if (found) {
            handleChange("memberId", String(found.id));
        }
    };

    const handleChange = (field: string, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const handlePackageChange = (packageId: string) => {
        const pkg = packages.find((p) => String(p.id) === packageId);
        setForm((prev) => ({
            ...prev,
            packageId,
            amount: pkg ? String(Number(pkg.price)) : "",
        }));
    };

    const selectedPkg = packages.find((p) => String(p.id) === form.packageId);
    const expireDate = selectedPkg && form.startDate
        ? (() => {
            const d = new Date(form.startDate);
            d.setDate(d.getDate() + selectedPkg.durationDays);
            return d.toLocaleDateString("th-TH", {
                year: "numeric", month: "long", day: "numeric",
            });
        })()
        : null;
    const selectedPromotion = promotions.find((p) => String(p.id) === promotionId);

    const calcDiscount = () => {
        if (!selectedPromotion || !form.amount) return 0;
        const amount = Number(form.amount);
        if (selectedPromotion.type === "DISCOUNT_AMOUNT") {
            return Number(selectedPromotion.value);
        }
        if (selectedPromotion.type === "DISCOUNT_PERCENT") {
            return Math.floor(amount * Number(selectedPromotion.value) / 100);
        }
        return 0; // BONUS_DAYS ไม่ลดเงิน
    };

    const discount = calcDiscount();
    const finalAmount = Math.max(0, Number(form.amount) - discount);

    const handleSubmit = async () => {
        setError("");
        setSuccess(null);

        if (!form.memberId || !form.packageId || !form.amount || !form.method) {
            setError("กรุณากรอกข้อมูลให้ครบ");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/api/payments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    memberId: Number(form.memberId),
                    packageId: Number(form.packageId),
                    amount: finalAmount,
                    method: form.method,
                    note: form.note || undefined,
                    startDate: form.startDate,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "เกิดข้อผิดพลาด");

            setSuccess(data.receiptNumber);
            setForm({
                memberId: "", packageId: "", amount: "",
                method: "", note: "",
                startDate: new Date().toISOString().split("T")[0],
            });
            router.refresh();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="border rounded-xl p-6 space-y-5">
            {/* ค้นหา / สแกนบัตร */}
            <div className="space-y-1.5">
                <Label>สแกนบัตรหรือค้นหาสมาชิก</Label>
                <div className="flex gap-2">
                    <Input
                        placeholder="สแกนบัตร หรือพิมพ์รหัสสมาชิก เช่น M00004"
                        value={search}
                        onChange={(e) => handleSearchOrScan(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleSearchOrScan(search);
                        }}
                        autoFocus
                    />
                </div>
                {/* แสดงสมาชิกที่เจอ */}
                {form.memberId && (() => {
                    const m = members.find((m) => String(m.id) === form.memberId);
                    return m ? (
                        <div className="rounded-lg px-3 py-2 text-sm flex items-center gap-2"
                            style={{ background: "#ede9fe", color: "#4f46e5" }}>
                            ✓ {m.memberCode} — {m.firstName} {m.lastName}
                        </div>
                    ) : null;
                })()}
            </div>


            {/* สมาชิก */}
            <div className="space-y-1.5">
                <Label>สมาชิก <span className="text-destructive">*</span></Label>
                <Select value={form.memberId} onValueChange={(v) => handleChange("memberId", v)}>
                    <SelectTrigger><SelectValue placeholder="เลือกสมาชิก" /></SelectTrigger>
                    <SelectContent>
                        {members.map((m) => (
                            <SelectItem key={m.id} value={String(m.id)}>
                                {m.memberCode} — {m.firstName} {m.lastName}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* แพ็กเกจ */}
            <div className="space-y-1.5">
                <Label>แพ็กเกจ <span className="text-destructive">*</span></Label>
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

            {/* วันเริ่ม + expire preview */}
            {form.packageId && (
                <div className="space-y-2">
                    <div className="space-y-1.5">
                        <Label>วันเริ่มต้น</Label>
                        <Input type="date" value={form.startDate}
                            onChange={(e) => handleChange("startDate", e.target.value)} />
                    </div>
                    {expireDate && (
                        <div className="rounded-lg px-3 py-2 text-sm"
                            style={{ background: "#ede9fe", color: "#4f46e5" }}>
                            วันหมดอายุ: {expireDate}
                        </div>
                    )}
                </div>
            )}

            {/* จำนวนเงิน */}
            <div className="space-y-1.5">
                <Label>จำนวนเงิน (บาท) <span className="text-destructive">*</span></Label>
                <Input type="number" value={form.amount}
                    onChange={(e) => handleChange("amount", e.target.value)} />
            </div>
            {/* โปรโมชั่น */}
            {promotions.length > 0 && (
                <div className="space-y-1.5">
                    <Label>โปรโมชั่น (ถ้ามี)</Label>
                    <Select value={promotionId} onValueChange={setPromotionId}>
                        <SelectTrigger><SelectValue placeholder="ไม่ใช้โปรโมชั่น" /></SelectTrigger>
                        <SelectContent>
                            {promotions.map((p) => (
                                <SelectItem key={p.id} value={String(p.id)}>
                                    {p.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* แสดงผลส่วนลด */}
                    {selectedPromotion && (
                        <div className="rounded-lg p-3 space-y-1 text-sm"
                            style={{ background: "#f0fdf4", border: "1px solid #86efac" }}>
                            {selectedPromotion.type === "BONUS_DAYS" ? (
                                <div className="text-green-700">
                                    🎁 แถม {selectedPromotion.value} วัน
                                </div>
                            ) : (
                                <>
                                    <div className="text-green-700">
                                        ส่วนลด: {discount.toLocaleString()} บาท
                                    </div>
                                    <div className="font-semibold text-green-800">
                                        ยอดสุทธิ: {finalAmount.toLocaleString()} บาท
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ช่องทางชำระ */}
            <div className="space-y-1.5">
                <Label>ช่องทางชำระเงิน <span className="text-destructive">*</span></Label>
                <div className="grid grid-cols-2 gap-2">
                    {Object.entries(methodLabel).map(([value, label]) => (
                        <button key={value}
                            onClick={() => handleChange("method", value)}
                            className="px-3 py-2 rounded-lg border text-sm font-medium transition-all"
                            style={form.method === value ? {
                                background: "linear-gradient(135deg, #ede9fe, #e0e7ff)",
                                borderColor: "#6366f1",
                                color: "#4f46e5",
                            } : {
                                color: "#64748b",
                            }}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* หมายเหตุ */}
            <div className="space-y-1.5">
                <Label>หมายเหตุ</Label>
                <Input placeholder="หมายเหตุเพิ่มเติม" value={form.note}
                    onChange={(e) => handleChange("note", e.target.value)} />
            </div>

            {/* Error */}
            {error && <p className="text-sm text-destructive">{error}</p>}

            {/* Success */}
            {success && (
                <div className="rounded-lg p-3 text-sm flex items-center gap-2"
                    style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #86efac" }}>
                    <Receipt className="w-4 h-4" />
                    ชำระเงินสำเร็จ! เลขใบเสร็จ: <strong>{success}</strong>
                </div>
            )}

            <Button onClick={handleSubmit} disabled={loading} className="w-full gap-2">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <Receipt className="w-4 h-4" />
                บันทึกการชำระเงิน
            </Button>
        </div>
    );
}