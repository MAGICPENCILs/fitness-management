import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ClassOperationError,
  createFitnessClass,
} from "@/lib/class-service";
import { getCurrentBranchId } from "@/lib/branch-service";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

/** คืนวันที่ปัจจุบันตามเวลาไทยสำหรับป้องกันการเปิดรอบย้อนหลัง */
function getBangkokToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const classSchema = z
  .object({
    trainerId: z.coerce.number().int().positive(),
    name: z.string().trim().min(2, "กรุณาระบุชื่อคลาส").max(120),
    category: z.enum(["YOGA", "ZUMBA", "SPINNING", "STRENGTH", "OTHER"]),
    room: z.string().trim().min(1, "กรุณาระบุห้องหรือพื้นที่").max(100),
    classDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ไม่ถูกต้อง"),
    startTime: z.string().regex(timePattern, "เวลาเริ่มไม่ถูกต้อง"),
    endTime: z.string().regex(timePattern, "เวลาจบไม่ถูกต้อง"),
    capacity: z.coerce.number().int().min(1).max(500),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((value) => value.endTime > value.startTime, {
    message: "เวลาจบต้องอยู่หลังเวลาเริ่ม",
    path: ["endTime"],
  })
  .refine((value) => value.classDate >= getBangkokToday(), {
    message: "ไม่สามารถสร้างรอบคลาสย้อนหลังได้",
    path: ["classDate"],
  });

/** ตรวจข้อมูลรอบคลาสและส่งให้ service ตรวจตารางเทรนเนอร์ก่อนบันทึก */
export async function POST(request: Request) {
  try {
    const validated = classSchema.parse(await request.json());
    const id = await createFitnessClass({ ...validated, branchId: await getCurrentBranchId() });
    return NextResponse.json(
      { message: "สร้างรอบคลาสแล้ว", id },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "ข้อมูลรอบคลาสไม่ถูกต้อง" },
        { status: 400 },
      );
    if (error instanceof ClassOperationError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error(error);
    return NextResponse.json(
      { error: "ไม่สามารถสร้างรอบคลาสได้" },
      { status: 500 },
    );
  }
}
