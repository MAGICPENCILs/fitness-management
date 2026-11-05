"use client";

import { Button } from "@/components/ui/button";

/** แสดงข้อความกลางและให้ลอง query รายงานใหม่โดยไม่เผยรายละเอียดฐานข้อมูล */
export default function ReportsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="mx-auto max-w-xl p-8 text-center"><h1 className="text-2xl font-bold">โหลดรายงานไม่สำเร็จ</h1><p className="mt-2 text-sm text-muted-foreground">กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง</p><Button className="mt-5" onClick={reset}>ลองใหม่</Button></div>;
}
