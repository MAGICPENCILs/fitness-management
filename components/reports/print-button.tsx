"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** เปิด print dialog ของ browser เพื่อพิมพ์หรือบันทึก PDF จาก layout A4 */
export function PrintButton() {
  return <Button type="button" variant="outline" onClick={() => window.print()}><Printer aria-hidden="true" />พิมพ์ / PDF</Button>;
}
