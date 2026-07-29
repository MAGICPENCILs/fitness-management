"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScanLine, Loader2, CheckCircle2, TriangleAlert, XCircle } from "lucide-react";

type ScanResult = {
  result: "APPROVED" | "REJECTED";
  reason?: string;
  warning?: string | null;
  member?: {
    memberCode: string;
    firstName: string;
    lastName: string;
    photoUrl: string | null;
    expireDate: string;
    daysLeft: number;
  };
};

/** รับรหัสบัตรและแสดงผลอนุญาตเข้าใช้บริการด้วยสถานะที่อ่านได้ทั้งสองโหมดสี */
export function ScanPage() {
  const [serial, setSerial] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  /** ส่งรหัสบัตรที่ตัดช่องว่างแล้วไปตรวจสิทธิ์ โดยคงผลตอบกลับของเซิร์ฟเวอร์เป็นแหล่งข้อมูลหลัก */
  const handleScan = async () => {
    if (!serial.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serial: serial.trim() }),
      });
      const data = await res.json();
      setScanResult(data);
    } finally {
      setLoading(false);
    }
  };

  /** รองรับการกด Enter เพื่อให้เครื่องสแกนและผู้ใช้คีย์บอร์ดส่งรหัสได้ทันที */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleScan();
  };

  /** ล้างผลเดิมก่อนรับสมาชิกคนถัดไป เพื่อลดความเสี่ยงในการอ่านข้อมูลผิดคน */
  const handleReset = () => {
    setScanResult(null);
    setSerial("");
  };

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <p className="mb-1 text-sm font-medium text-info">Access control</p>
        <h1 className="text-balance text-2xl font-bold sm:text-3xl">สแกนเข้าใช้บริการ</h1>
        <p className="text-muted-foreground text-sm">
          สแกน QR Code หรือพิมพ์รหัสบัตร
        </p>
      </div>

      {/* Input สแกน */}
      <div className="flex gap-2 rounded-xl border border-info/20 bg-card p-4 shadow-sm">
        <Input
          placeholder="รหัสบัตร เช่น C001"
          value={serial}
          onChange={(e) => setSerial(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <Button onClick={handleScan} disabled={loading} className="gap-2 shrink-0">
          {loading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <ScanLine className="w-4 h-4" />
          }
          สแกน
        </Button>
      </div>

      {/* ผลลัพธ์ */}
      {scanResult && (
        <div className={`rounded-2xl border-2 p-6 space-y-4 transition-all ${
          scanResult.result === "APPROVED"
            ? "border-success/40 bg-success-surface"
            : "border-destructive/40 bg-destructive/10"
        }`}>
          {/* Icon + ผล */}
          <div className="flex items-center gap-3">
            {scanResult.result === "APPROVED"
              ? <CheckCircle2 className="w-10 h-10 text-success" />
              : <XCircle className="w-10 h-10 text-destructive" />
            }
            <div>
              <div className={`text-xl font-bold ${
                scanResult.result === "APPROVED" ? "text-success" : "text-destructive"
              }`}>
                {scanResult.result === "APPROVED" ? "อนุญาตเข้าใช้บริการ" : "ไม่อนุญาต"}
              </div>
              {scanResult.reason && (
                <div className="text-sm text-muted-foreground">{scanResult.reason}</div>
              )}
            </div>
          </div>

          {/* ข้อมูลสมาชิก */}
          {scanResult.member && (
            <div className="flex items-center gap-4 border-t border-success/25 pt-2">
              {scanResult.member.photoUrl ? (
                <img
                  src={scanResult.member.photoUrl}
                  alt="photo"
                  className="w-16 h-16 rounded-full border-2 border-success/40 object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-xl font-bold text-success">
                  {scanResult.member.firstName[0]}
                </div>
              )}
              <div className="space-y-1">
                <div className="font-semibold text-lg">
                  {scanResult.member.firstName} {scanResult.member.lastName}
                </div>
                <div className="text-sm text-muted-foreground">
                  {scanResult.member.memberCode}
                </div>
                <div className="text-sm">
                  หมดอายุ: {new Date(scanResult.member.expireDate).toLocaleDateString("th-TH", {
                    year: "numeric", month: "long", day: "numeric"
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Warning */}
          {scanResult.warning && (
            <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-surface px-4 py-2 text-sm font-medium text-warning-foreground" role="status">
              <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
              <span>{scanResult.warning} — กรุณาต่ออายุ</span>
            </div>
          )}

          {/* ปุ่มสแกนต่อ */}
          <Button variant="outline" className="w-full" onClick={handleReset}>
            สแกนต่อ
          </Button>
        </div>
      )}
    </div>
  );
}
