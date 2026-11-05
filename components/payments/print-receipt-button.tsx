"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** เปิด print dialog ของ browser โดยให้ CSS แสดงเฉพาะเอกสาร A4 */
export function PrintReceiptButton() {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden="true" />
      พิมพ์เอกสาร
    </Button>
  );
}
