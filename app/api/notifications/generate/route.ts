import { NextResponse } from "next/server";
import { generateNotifications } from "@/lib/notification-engine";

/** ประมวลผลสมาชิกที่เข้าเกณฑ์และสร้างคิวแจ้งเตือนโดยไม่สร้างรายการซ้ำ */
export async function POST() {
  try {
    return NextResponse.json(await generateNotifications());
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถประมวลผลการแจ้งเตือนได้" }, { status: 500 });
  }
}
