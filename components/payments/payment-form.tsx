"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Receipt, TicketPercent } from "lucide-react";
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
import { calculatePromotionBenefit } from "@/lib/promotion-benefit";
import { cn } from "@/lib/utils";

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
  type: "DISCOUNT_AMOUNT" | "DISCOUNT_PERCENT" | "BONUS_DAYS";
  value: string;
  startDate: string | Date;
  endDate: string | Date;
};

type CouponQuote = {
  code: string;
  promotionName: string;
  originalAmount: number;
  discountAmount: number;
  bonusDays: number;
  finalAmount: number;
};

const methodLabel = {
  CASH: "เงินสด",
  QR_PROMPTPAY: "QR PromptPay",
  TRANSFER: "โอนเงิน",
  CREDIT_CARD: "บัตรเครดิต/เดบิต",
} as const;

const money = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const initialForm = {
  memberId: "",
  packageId: "",
  method: "",
  note: "",
  startDate: new Date().toISOString().split("T")[0],
};

/** จัดการขั้นตอนเลือกสมาชิก แพ็กเกจ โปรโมชันหรือคูปอง และบันทึกการชำระเงิน */
export function PaymentForm({
  members,
  packages,
  promotions = [],
}: {
  members: Member[];
  packages: Package[];
  promotions?: Promotion[];
}) {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState("");
  const [promotionId, setPromotionId] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponQuote, setCouponQuote] = useState<CouponQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [couponError, setCouponError] = useState("");

  const selectedMember = members.find((member) => String(member.id) === form.memberId);
  const selectedPackage = packages.find((item) => String(item.id) === form.packageId);
  const selectedPromotion = promotions.find((promotion) => String(promotion.id) === promotionId);
  const originalAmount = Number(selectedPackage?.price ?? 0);
  const directBenefit = calculatePromotionBenefit(originalAmount, selectedPromotion);
  const activeBenefit = couponQuote ?? directBenefit;

  const expireDate = selectedPackage && form.startDate
    ? (() => {
        const date = new Date(`${form.startDate}T00:00:00`);
        date.setDate(date.getDate() + selectedPackage.durationDays + activeBenefit.bonusDays);
        return date.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
      })()
    : null;

  // อัปเดตข้อมูลการชำระเงินและล้างสถานะสำเร็จจากรายการก่อนหน้า
  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setSuccess(null);
  };

  // เลือกสมาชิกอัตโนมัติเมื่อสแกนหรือกรอกรหัสสมาชิกตรงกันพอดี
  const handleSearch = (value: string) => {
    setSearch(value);
    const normalized = value.trim().toLowerCase();
    const found = members.find((member) => member.memberCode.toLowerCase() === normalized);
    if (found) handleChange("memberId", String(found.id));
  };

  // ล้างโปรโมชันและคูปองเดิม เพราะสิทธิประโยชน์ต้องคำนวณใหม่ตามแพ็กเกจ
  const handlePackageChange = (value: string) => {
    handleChange("packageId", value);
    setPromotionId("");
    setCouponCode("");
    setCouponQuote(null);
    setCouponError("");
  };

  // การเลือกโปรโมชันหน้าเคาน์เตอร์จะยกเลิกคูปอง เนื่องจากใช้ร่วมกันไม่ได้
  const handlePromotionChange = (value: string) => {
    setPromotionId(value);
    setCouponCode("");
    setCouponQuote(null);
    setCouponError("");
  };

  // ทำรหัสเป็นตัวพิมพ์ใหญ่และยกเลิกผลตรวจเดิมเมื่อรหัสเปลี่ยน
  const handleCouponChange = (value: string) => {
    setCouponCode(value.toUpperCase());
    if (couponQuote) setCouponQuote(null);
    setCouponError("");
  };

  // ตรวจสิทธิ์กับเซิร์ฟเวอร์ก่อนแสดงยอดสุทธิ แต่เซิร์ฟเวอร์จะตรวจซ้ำตอนชำระเงินจริง
  const validateCoupon = async () => {
    setCouponError("");
    if (!form.memberId || !form.packageId || !couponCode.trim()) {
      setCouponError("กรุณาเลือกสมาชิก แพ็กเกจ และกรอกรหัสคูปอง");
      return;
    }
    setValidatingCoupon(true);
    try {
      const response = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: couponCode,
          memberId: Number(form.memberId),
          packageId: Number(form.packageId),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "ไม่สามารถใช้คูปองได้");
      setCouponQuote(result);
      setPromotionId("");
    } catch (validationError) {
      setCouponQuote(null);
      setCouponError(validationError instanceof Error ? validationError.message : "ไม่สามารถใช้คูปองได้");
    } finally {
      setValidatingCoupon(false);
    }
  };

  // ส่งเฉพาะตัวเลือกของผู้ใช้ โดยให้เซิร์ฟเวอร์เป็นผู้กำหนดราคาและส่วนลดที่เชื่อถือได้
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess(null);
    if (!form.memberId || !form.packageId || !form.method) {
      setError("กรุณาเลือกสมาชิก แพ็กเกจ และช่องทางชำระเงิน");
      return;
    }
    if (couponCode && !couponQuote) {
      setError("กรุณากดตรวจสอบคูปองก่อนบันทึกการชำระเงิน");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: Number(form.memberId),
          packageId: Number(form.packageId),
          method: form.method,
          note: form.note || undefined,
          startDate: form.startDate,
          promotionId: promotionId ? Number(promotionId) : undefined,
          couponCode: couponQuote ? couponQuote.code : undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "ไม่สามารถบันทึกการชำระเงินได้");

      setSuccess(result.receiptNumber);
      setForm(initialForm);
      setSearch("");
      setPromotionId("");
      setCouponCode("");
      setCouponQuote(null);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "ไม่สามารถบันทึกการชำระเงินได้");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="space-y-6 rounded-xl border bg-card p-4 shadow-sm sm:p-6" onSubmit={handleSubmit}>
      <div className="space-y-1.5">
        <Label htmlFor="member-search">สแกนบัตรหรือค้นหาสมาชิก</Label>
        <Input
          id="member-search"
          value={search}
          onChange={(event) => handleSearch(event.target.value)}
          placeholder="สแกนบัตรหรือพิมพ์รหัส เช่น M00004"
          autoComplete="off"
        />
        {selectedMember ? (
          <div className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            <span>{selectedMember.memberCode} — {selectedMember.firstName} {selectedMember.lastName}</span>
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="payment-member">สมาชิก <span className="text-destructive">*</span></Label>
        <Select value={form.memberId} onValueChange={(value) => handleChange("memberId", value)} required>
          <SelectTrigger id="payment-member" className="w-full"><SelectValue placeholder="เลือกสมาชิก" /></SelectTrigger>
          <SelectContent>
            {members.map((member) => (
              <SelectItem key={member.id} value={String(member.id)}>
                {member.memberCode} — {member.firstName} {member.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="payment-package">แพ็กเกจ <span className="text-destructive">*</span></Label>
        <Select value={form.packageId} onValueChange={handlePackageChange} required>
          <SelectTrigger id="payment-package" className="w-full"><SelectValue placeholder="เลือกแพ็กเกจ" /></SelectTrigger>
          <SelectContent>
            {packages.map((item) => (
              <SelectItem key={item.id} value={String(item.id)}>
                {item.name} — {money.format(Number(item.price))} ({item.durationDays} วัน)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedPackage ? (
        <div className="space-y-1.5">
          <Label htmlFor="payment-start-date">วันที่เริ่มต้น</Label>
          <Input id="payment-start-date" type="date" value={form.startDate} onChange={(event) => handleChange("startDate", event.target.value)} required />
          {expireDate ? <p className="text-sm text-muted-foreground">วันหมดอายุโดยประมาณ: {expireDate}</p> : null}
        </div>
      ) : null}

      {selectedPackage && promotions.length ? (
        <div className="space-y-2">
          <Label htmlFor="payment-promotion">โปรโมชันหน้าเคาน์เตอร์</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={promotionId} onValueChange={handlePromotionChange}>
              <SelectTrigger id="payment-promotion" className="w-full"><SelectValue placeholder="ไม่ใช้โปรโมชัน" /></SelectTrigger>
              <SelectContent>
                {promotions.map((promotion) => (
                  <SelectItem key={promotion.id} value={String(promotion.id)}>{promotion.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {promotionId ? <Button type="button" variant="outline" onClick={() => setPromotionId("")}>ล้าง</Button> : null}
          </div>
          <p className="text-xs text-muted-foreground">เลือกโปรโมชันหรือใช้คูปองได้อย่างใดอย่างหนึ่ง</p>
        </div>
      ) : null}

      {selectedPackage ? (
        <div className="space-y-2">
          <Label htmlFor="payment-coupon">รหัสคูปอง</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="payment-coupon" value={couponCode} onChange={(event) => handleCouponChange(event.target.value)} placeholder="กรอกรหัสคูปอง" autoComplete="off" />
            <Button type="button" variant="outline" onClick={validateCoupon} disabled={validatingCoupon || !couponCode.trim()}>
              {validatingCoupon ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <TicketPercent className="size-4" aria-hidden="true" />}
              ตรวจสอบ
            </Button>
          </div>
          {couponError ? <p className="text-sm text-destructive" role="alert">{couponError}</p> : null}
          {couponQuote ? (
            <p className="flex items-center gap-2 text-sm text-primary" aria-live="polite">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              ใช้ {couponQuote.code}: {couponQuote.promotionName}
            </p>
          ) : null}
        </div>
      ) : null}

      {selectedPackage ? (
        <dl className="space-y-2 rounded-xl bg-muted p-4 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">ราคาแพ็กเกจ</dt><dd className="tabular-nums">{money.format(originalAmount)}</dd></div>
          {activeBenefit.discountAmount > 0 ? (
            <div className="flex justify-between gap-4 text-primary"><dt>ส่วนลด</dt><dd className="tabular-nums">−{money.format(activeBenefit.discountAmount)}</dd></div>
          ) : null}
          {activeBenefit.bonusDays > 0 ? (
            <div className="flex justify-between gap-4 text-primary"><dt>วันใช้งานโบนัส</dt><dd className="tabular-nums">+{activeBenefit.bonusDays} วัน</dd></div>
          ) : null}
          <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold"><dt>ยอดสุทธิ</dt><dd className="tabular-nums">{money.format(activeBenefit.finalAmount)}</dd></div>
        </dl>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">ช่องทางชำระเงิน <span className="text-destructive">*</span></legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(methodLabel).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={form.method === value}
              onClick={() => handleChange("method", value)}
              className={cn(
                "min-h-11 rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                form.method === value && "border-primary bg-accent text-accent-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="payment-note">หมายเหตุ</Label>
        <Input id="payment-note" value={form.note} onChange={(event) => handleChange("note", event.target.value)} placeholder="รายละเอียดเพิ่มเติม" />
      </div>

      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      {success ? (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-accent p-3 text-sm text-accent-foreground" aria-live="polite">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          <span>ชำระเงินสำเร็จ เลขใบเสร็จ <strong>{success}</strong></span>
        </div>
      ) : null}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Receipt className="size-4" aria-hidden="true" />}
        บันทึกการชำระเงิน
      </Button>
    </form>
  );
}
