import { NextResponse } from "next/server";
import { z } from "zod";
import { EquipmentOperationError } from "@/lib/equipment-service";
import { AuthorizationError } from "@/lib/staff-service";

const SAFE_UNKNOWN_ERROR_NAMES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "DrizzleQueryError",
]);
const BANGKOK_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** อ่านชื่อ error แบบ fail-closed เพื่อไม่ให้ accessor หรือข้อความที่ผู้โจมตีควบคุมได้หลุดเข้า log */
function getSafeUnknownErrorName(error: unknown): string {
  if (!(error instanceof Error)) return "UNKNOWN_ERROR";
  try {
    const name = error.name;
    return SAFE_UNKNOWN_ERROR_NAMES.has(name) ? name : "UNKNOWN_ERROR";
  } catch {
    return "UNKNOWN_ERROR";
  }
}

/** สร้างวันปฏิทินของกรุงเทพจากเวลาจริง เพื่อไม่ให้ server timezone ทำให้สถานะบำรุงคลาดหนึ่งวัน */
export function getBangkokCalendarDate(date = new Date()): string {
  const parts = Object.fromEntries(
    BANGKOK_DATE_FORMATTER.formatToParts(date).map(({ type, value }) => [
      type,
      value,
    ]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

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
    const code =
      error instanceof EquipmentOperationError &&
      (error.code === "EQUIPMENT_CODE_CONFLICT" ||
        error.code === "STALE_VERSION")
        ? error.code
        : undefined;
    return NextResponse.json(
      { error: error.message, ...(code ? { code } : {}) },
      { status: error.status },
    );
  }
  console.error(
    "Equipment route unavailable",
    getSafeUnknownErrorName(error),
  );
  return NextResponse.json(
    { error: "ไม่สามารถดำเนินการกับอุปกรณ์ได้" },
    { status: 500 },
  );
}
