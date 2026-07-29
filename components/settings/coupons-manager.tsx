"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, TicketPercent } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

type PromotionOption = {
  id: number;
  name: string;
  type: string;
  value: string;
};

export type CouponRow = {
  id: number;
  code: string;
  promotionId: number;
  promotionName: string;
  promotionType: string;
  promotionValue: string;
  maxUses: number | null;
  usedCount: number;
  perMemberLimit: number;
  minPurchase: string;
  isActive: boolean;
};

const initialForm = {
  code: "",
  promotionId: "",
  maxUses: "",
  perMemberLimit: "1",
  minPurchase: "0",
};

function formatBenefit(type: string, value: string) {
  if (type === "DISCOUNT_AMOUNT") return `ลด ${Number(value).toLocaleString("th-TH")} บาท`;
  if (type === "DISCOUNT_PERCENT") return `ลด ${Number(value).toLocaleString("th-TH")}%`;
  return `เพิ่ม ${Number(value).toLocaleString("th-TH")} วัน`;
}

export function CouponsManager({
  coupons,
  promotions,
}: {
  coupons: CouponRow[];
  promotions: PromotionOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState(initialForm);

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          promotionId: Number(form.promotionId),
          maxUses: form.maxUses ? Number(form.maxUses) : null,
          perMemberLimit: Number(form.perMemberLimit),
          minPurchase: Number(form.minPurchase),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "ไม่สามารถสร้างคูปองได้");
      setForm(initialForm);
      setOpen(false);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "ไม่สามารถสร้างคูปองได้");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (coupon: CouponRow) => {
    setError("");
    setUpdatingId(coupon.id);
    try {
      const response = await fetch(`/api/coupons/${coupon.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !coupon.isActive }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "ไม่สามารถอัปเดตคูปองได้");
      router.refresh();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "ไม่สามารถอัปเดตคูปองได้");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-balance text-lg font-semibold">คูปองโค้ด</h2>
          <p className="text-pretty text-sm text-muted-foreground">สร้างรหัสส่วนลดและกำหนดจำนวนสิทธิ์การใช้งาน</p>
        </div>
        <Dialog open={open} onOpenChange={(value) => { setOpen(value); setError(""); }}>
          <DialogTrigger asChild>
            <Button disabled={promotions.length === 0}>
              <Plus className="size-4" aria-hidden="true" />
              เพิ่มคูปอง
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>เพิ่มคูปองใหม่</DialogTitle>
              <DialogDescription>คูปองหนึ่งรหัสจะใช้เงื่อนไขส่วนลดและช่วงเวลาจากโปรโมชันที่เลือก</DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <Label htmlFor="coupon-code">รหัสคูปอง</Label>
                <Input
                  id="coupon-code"
                  value={form.code}
                  onChange={(event) => handleChange("code", event.target.value.toUpperCase())}
                  placeholder="เช่น WELCOME100"
                  autoComplete="off"
                  required
                />
                <p className="text-xs text-muted-foreground">ใช้ตัวอักษรอังกฤษ ตัวเลข ขีดกลาง หรือขีดล่าง 3–32 ตัว</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="coupon-promotion">โปรโมชัน</Label>
                <Select value={form.promotionId} onValueChange={(value) => handleChange("promotionId", value)} required>
                  <SelectTrigger id="coupon-promotion" className="w-full">
                    <SelectValue placeholder="เลือกโปรโมชัน" />
                  </SelectTrigger>
                  <SelectContent>
                    {promotions.map((promotion) => (
                      <SelectItem key={promotion.id} value={String(promotion.id)}>
                        {promotion.name} — {formatBenefit(promotion.type, promotion.value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="coupon-max-uses">จำนวนใช้รวม</Label>
                  <Input id="coupon-max-uses" type="number" min="1" value={form.maxUses} onChange={(event) => handleChange("maxUses", event.target.value)} placeholder="ไม่จำกัด" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="coupon-member-limit">สิทธิ์ต่อสมาชิก</Label>
                  <Input id="coupon-member-limit" type="number" min="1" max="100" value={form.perMemberLimit} onChange={(event) => handleChange("perMemberLimit", event.target.value)} required />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="coupon-min-purchase">ยอดขั้นต่ำ (บาท)</Label>
                <Input id="coupon-min-purchase" type="number" min="0" step="0.01" value={form.minPurchase} onChange={(event) => handleChange("minPurchase", event.target.value)} required />
              </div>

              {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
                <Button type="submit" disabled={loading || !form.promotionId}>
                  {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  บันทึกคูปอง
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error && !open ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

      <div className="divide-y overflow-hidden rounded-xl border bg-card">
        {coupons.length === 0 ? (
          <div className="p-8 text-center">
            <TicketPercent className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 font-medium">ยังไม่มีคูปอง</p>
            <p className="mt-1 text-pretty text-sm text-muted-foreground">
              {promotions.length ? "กดเพิ่มคูปองเพื่อสร้างรหัสแรก" : "สร้างโปรโมชันก่อน แล้วจึงนำมาออกเป็นคูปอง"}
            </p>
          </div>
        ) : (
          coupons.map((coupon) => (
            <article key={coupon.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded-md bg-accent px-2 py-1 font-semibold text-accent-foreground">{coupon.code}</code>
                  <Badge variant={coupon.isActive ? "default" : "outline"}>{coupon.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}</Badge>
                </div>
                <p className="mt-2 font-medium">{coupon.promotionName}</p>
                <p className="mt-1 text-pretty text-sm text-muted-foreground">
                  {formatBenefit(coupon.promotionType, coupon.promotionValue)} · ใช้แล้ว {coupon.usedCount.toLocaleString("th-TH")}/{coupon.maxUses?.toLocaleString("th-TH") ?? "ไม่จำกัด"} · ต่อสมาชิก {coupon.perMemberLimit} ครั้ง
                </p>
                {Number(coupon.minPurchase) > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">ยอดขั้นต่ำ {Number(coupon.minPurchase).toLocaleString("th-TH")} บาท</p>
                ) : null}
              </div>
              <Button variant="outline" size="sm" disabled={updatingId === coupon.id} onClick={() => handleToggle(coupon)}>
                {updatingId === coupon.id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {coupon.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
              </Button>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
