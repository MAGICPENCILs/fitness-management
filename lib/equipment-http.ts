import { NextResponse } from "next/server";
import { z } from "zod";
import { EquipmentOperationError } from "@/lib/equipment-service";
import { AuthorizationError } from "@/lib/staff-service";

/** แปลงเฉพาะ error ที่ควบคุมได้ และห้ามสะท้อนข้อความหรือรายละเอียดระบบจาก error ที่ไม่รู้จัก */
export function equipmentErrorResponse(error: unknown): NextResponse {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "ข้อมูลอุปกรณ์ไม่ถูกต้อง" },
      { status: 400 },
    );
  }
  if (error instanceof Error && error.message === "Untrusted origin") {
    return NextResponse.json(
      { error: "ไม่สามารถดำเนินการได้" },
      { status: 403 },
    );
  }
  if (
    error instanceof AuthorizationError ||
    error instanceof EquipmentOperationError
  ) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  console.error(
    "Equipment route unavailable",
    error instanceof Error ? error.name : "UNKNOWN_ERROR",
  );
  return NextResponse.json(
    { error: "ไม่สามารถดำเนินการกับอุปกรณ์ได้" },
    { status: 500 },
  );
}
