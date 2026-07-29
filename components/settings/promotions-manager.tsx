"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Loader2, Tag } from "lucide-react";
import { Promotion } from "@/db/schema";

const typeLabel: Record<string, string> = {
  DISCOUNT_AMOUNT:  "ลดเป็นจำนวนเงิน",
  DISCOUNT_PERCENT: "ลดเป็นเปอร์เซ็นต์",
  BONUS_DAYS:       "แถมวัน",
};

export function PromotionsManager({ data }: { data: Promotion[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    name:        "",
    description: "",
    type:        "",
    value:       "",
    startDate:   today,
    endDate:     "",
  });

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    setError("");
    if (!form.name || !form.type || !form.value || !form.startDate || !form.endDate) {
      setError("กรุณากรอกข้อมูลให้ครบ");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:        form.name,
          description: form.description || undefined,
          type:        form.type,
          value:       Number(form.value),
          startDate:   form.startDate,
          endDate:     form.endDate,
        }),
      });

      if (!res.ok) throw new Error("สร้างโปรโมชั่นไม่สำเร็จ");

      setOpen(false);
      setForm({ name: "", description: "", type: "", value: "", startDate: today, endDate: "" });
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  };

  const formatValue = (type: string, value: string) => {
    if (type === "DISCOUNT_AMOUNT")  return `${Number(value).toLocaleString()} บาท`;
    if (type === "DISCOUNT_PERCENT") return `${value}%`;
    if (type === "BONUS_DAYS")       return `${value} วัน`;
    return value;
  };

  const handleToggle = async (id: number, current: boolean) => {
    try {
      await fetch(`/api/promotions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !current }),
      });
      router.refresh();
    } catch {
      alert("เกิดข้อผิดพลาด");
    }
  };

  return (
    <div className="space-y-4">
      {/* ปุ่มเพิ่ม */}
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              เพิ่มโปรโมชั่น
            </Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>เพิ่มโปรโมชั่นใหม่</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>ชื่อโปรโมชั่น <span className="text-destructive">*</span></Label>
                <Input placeholder="เช่น สมาชิกใหม่ลด 100 บาท"
                  value={form.name}
                  onChange={(e) => handleChange("name", e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>คำอธิบาย</Label>
                <Input placeholder="รายละเอียดเพิ่มเติม"
                  value={form.description}
                  onChange={(e) => handleChange("description", e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>ประเภท <span className="text-destructive">*</span></Label>
                  <Select value={form.type} onValueChange={(v) => handleChange("type", v)}>
                    <SelectTrigger><SelectValue placeholder="เลือก" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(typeLabel).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>
                    {form.type === "DISCOUNT_PERCENT" ? "เปอร์เซ็นต์" :
                     form.type === "BONUS_DAYS" ? "จำนวนวัน" : "จำนวนเงิน (บาท)"}
                    <span className="text-destructive"> *</span>
                  </Label>
                  <Input type="number" placeholder="0"
                    value={form.value}
                    onChange={(e) => handleChange("value", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>วันเริ่มต้น <span className="text-destructive">*</span></Label>
                  <Input type="date" value={form.startDate}
                    onChange={(e) => handleChange("startDate", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>วันสิ้นสุด <span className="text-destructive">*</span></Label>
                  <Input type="date" value={form.endDate}
                    onChange={(e) => handleChange("endDate", e.target.value)} />
                </div>
              </div>

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
      </div>

      {/* รายการโปรโมชั่น */}
      <div className="border rounded-lg divide-y">
        {data.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            ยังไม่มีโปรโมชั่น
          </div>
        ) : (
          data.map((promo) => (
            <div key={promo.id} className="p-4 flex items-center justify-between">
              {/* ซ้าย — ข้อมูล */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-primary" />
                  <span className="font-medium">{promo.name}</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {typeLabel[promo.type]} — {formatValue(promo.type, promo.value)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(promo.startDate).toLocaleDateString("th-TH")} —{" "}
                  {new Date(promo.endDate).toLocaleDateString("th-TH")}
                </div>
              </div>

              {/* ขวา — Badge + ปุ่ม */}
              <div className="flex items-center gap-2">
                <Badge variant="outline"
                  style={promo.isActive ? {
                    background: "#dcfce7",
                    color: "#16a34a",
                    border: "1px solid #86efac",
                  } : {
                    background: "#fee2e2",
                    color: "#dc2626",
                    border: "1px solid #fca5a5",
                  }}>
                  {promo.isActive ? "เปิดใช้งาน" : "ปิดแล้ว"}
                </Badge>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggle(promo.id, promo.isActive ?? true)}
                  style={promo.isActive ? {
                    color: "#dc2626",
                    borderColor: "#fca5a5",
                  } : {
                    color: "#16a34a",
                    borderColor: "#86efac",
                  }}>
                  {promo.isActive ? "ปิด" : "เปิด"}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
