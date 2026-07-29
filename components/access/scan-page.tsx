"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export function ScanPage() {
  const [serial, setSerial] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleScan();
  };

  const handleReset = () => {
    setScanResult(null);
    setSerial("");
  };

  return (
    <div className="p-6 space-y-6 max-w-lg mx-auto">
      <div>
        <h1 className="text-2xl font-bold">สแกนเข้าใช้บริการ</h1>
        <p className="text-muted-foreground text-sm">
          สแกน QR Code หรือพิมพ์รหัสบัตร
        </p>
      </div>

      {/* Input สแกน */}
      <div className="flex gap-2">
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
            ? "border-green-400 bg-green-50"
            : "border-red-400 bg-red-50"
        }`}>
          {/* Icon + ผล */}
          <div className="flex items-center gap-3">
            {scanResult.result === "APPROVED"
              ? <CheckCircle2 className="w-10 h-10 text-green-500" />
              : <XCircle className="w-10 h-10 text-red-500" />
            }
            <div>
              <div className={`text-xl font-bold ${
                scanResult.result === "APPROVED" ? "text-green-700" : "text-red-700"
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
            <div className="flex items-center gap-4 pt-2 border-t border-green-200">
              {scanResult.member.photoUrl ? (
                <img
                  src={scanResult.member.photoUrl}
                  alt="photo"
                  className="w-16 h-16 rounded-full object-cover border-2 border-green-300"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-green-200 flex items-center justify-center text-green-700 font-bold text-xl">
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
            <div className="flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-100 px-4 py-2 text-sm font-medium text-yellow-800" role="status">
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
