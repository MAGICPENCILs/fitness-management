"use client";

import { useState } from "react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScanLine, Loader2, CheckCircle2, DoorOpen, Radio, TriangleAlert, XCircle } from "lucide-react";

type ScanResult = {
  result: "APPROVED" | "REJECTED";
  reason?: string;
  warning?: string | null;
  door?: {
    opened: boolean;
    status: "OPENED" | "DISABLED" | "UNAVAILABLE" | "REJECTED";
  };
  member?: {
    id: number;
    memberCode: string;
    firstName: string;
    lastName: string;
    photoUrl: string | null;
    expireDate: string;
    daysLeft: number;
  };
};

/** แสดงรูปผ่าน member-ID gateway ที่ตรวจสิทธิ์ปัจจุบัน และไม่ให้ optimizer คงรูปหลังถอน consent */
export function ScanPage({
  hardwareHealth,
}: {
  hardwareHealth: { mode: "disabled" | "simulate" | "webhook"; ready: boolean };
}) {
  const [serial, setSerial] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);

  /** ส่งรหัสบัตรที่ตัดช่องว่างแล้วไปตรวจสิทธิ์ โดยคงผลตอบกลับของเซิร์ฟเวอร์เป็นแหล่งข้อมูลหลัก */
  const handleScan = async () => {
    if (!serial.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serial: serial.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ไม่สามารถตรวจสิทธิ์ได้");
      setScanResult(data);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "ไม่สามารถตรวจสิทธิ์ได้");
    } finally {
      setLoading(false);
    }
  };

  /** ขออ่าน credential จาก adapter ฝั่งเซิร์ฟเวอร์ แล้วให้ผู้ใช้กดสแกนเพื่อยืนยันการทำรายการ */
  const handleReadCredential = async () => {
    setReading(true);
    setError("");
    try {
      const response = await fetch("/api/hardware/credential", { method: "POST" });
      const result = await response.json();
      if (!response.ok || result.status !== "READ")
        throw new Error("เครื่องอ่านไม่พร้อมใช้งาน");
      setSerial(result.serial);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "เครื่องอ่านไม่พร้อมใช้งาน");
    } finally {
      setReading(false);
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
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className={`size-2 rounded-full ${hardwareHealth.ready ? "bg-success" : "bg-warning"}`} aria-hidden="true" />
          Hardware: {hardwareHealth.mode === "simulate" ? "Simulator" : hardwareHealth.mode === "webhook" ? "Webhook controller" : "ปิดใช้งาน"}
        </div>
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
      <Button type="button" variant="outline" className="w-full" onClick={handleReadCredential} disabled={reading || !hardwareHealth.ready}>
        {reading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Radio className="size-4" aria-hidden="true" />}
        อ่านจากเครื่อง
      </Button>
      {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p> : null}

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
                <Image
                  src={`/member-photos/by-member/${scanResult.member.id}`}
                  unoptimized
                  alt={`รูปสมาชิก ${scanResult.member.firstName} ${scanResult.member.lastName}`}
                  width={64}
                  height={64}
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

          {scanResult.result === "APPROVED" && scanResult.door ? (
            <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium ${scanResult.door.opened ? "border-success/30 bg-success-surface text-success" : "border-warning/30 bg-warning-surface text-warning-foreground"}`} role="status">
              {scanResult.door.opened ? <DoorOpen className="size-4" aria-hidden="true" /> : <TriangleAlert className="size-4" aria-hidden="true" />}
              <span>{scanResult.door.opened ? "ประตูเปิดแล้ว" : "ผ่านสิทธิ์แล้ว แต่ประตูยังไม่เปิด กรุณาตรวจ controller"}</span>
            </div>
          ) : null}

          {/* ปุ่มสแกนต่อ */}
          <Button variant="outline" className="w-full" onClick={handleReset}>
            สแกนต่อ
          </Button>
        </div>
      )}
    </div>
  );
}
