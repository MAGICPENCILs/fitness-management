"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CreditCard, Unlink } from "lucide-react";

type Card = {
  id: number;
  serial: string;
  status: string;
};

type Props = {
  memberId: number;
  assignedCard: Card | null;
  availableCards: Card[];
};

export function MemberCard({ memberId, assignedCard, availableCards }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(false);
  const [selectedSerial, setSelectedSerial] = useState("");
  const [currentCard, setCurrentCard] = useState<Card | null>(assignedCard);

  // วาด QR ตอน component โหลด
  useEffect(() => {
    if (currentCard && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, currentCard.serial, {
        width: 200,
        margin: 2,
        color: { dark: "#1e1b4b", light: "#ffffff" },
      });
    }
  }, [currentCard]);

  const handleAssign = async () => {
    if (!selectedSerial) return;
    setLoading(true);
    try {
      const res = await fetch("/api/cards/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serial: selectedSerial, memberId }),
      });
      if (!res.ok) throw new Error("ผูกบัตรไม่สำเร็จ");

      const card = availableCards.find((c) => c.serial === selectedSerial);
      setCurrentCard(card ?? null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  };

  const handleUnassign = async () => {
    if (!currentCard) return;
    if (!confirm(`ยืนยันการคืนบัตร ${currentCard.serial}?`)) return;
    setLoading(true);
    try {
      await fetch("/api/cards/unassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serial: currentCard.serial }),
      });
      setCurrentCard(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <h2 className="font-semibold flex items-center gap-2">
        <CreditCard className="w-4 h-4" />
        บัตรสมาชิก
      </h2>

      {currentCard ? (
        // มีบัตรอยู่แล้ว — แสดง QR
        <div className="border rounded-lg p-4 flex flex-col items-center gap-3">
          <canvas ref={canvasRef} className="rounded-lg" />
          <div className="text-sm font-medium text-center">
            บัตร: {currentCard.serial}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-destructive"
            onClick={handleUnassign}
            disabled={loading}
          >
            <Unlink className="w-3 h-3" />
            คืนบัตร
          </Button>
        </div>
      ) : (
        // ยังไม่มีบัตร — แสดงฟอร์มเลือกบัตร
        <div className="border rounded-lg p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            ยังไม่มีบัตร — เลือกบัตรจาก pool เพื่อมอบให้สมาชิก
          </p>
          <Select value={selectedSerial} onValueChange={setSelectedSerial}>
            <SelectTrigger>
              <SelectValue placeholder="เลือกบัตร" />
            </SelectTrigger>
            <SelectContent>
              {availableCards.map((card) => (
                <SelectItem key={card.id} value={card.serial}>
                  {card.serial}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="w-full gap-2"
            onClick={handleAssign}
            disabled={loading || !selectedSerial}
          >
            <CreditCard className="w-4 h-4" />
            มอบบัตร
          </Button>
        </div>
      )}
    </div>
  );
}