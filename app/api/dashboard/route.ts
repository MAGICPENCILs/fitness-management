import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/dashboard-data";
import { getCurrentBranchId } from "@/lib/branch-service";
import { AuthorizationError } from "@/lib/staff-service";
import {
  requireFullSession,
  SessionAuthenticationError,
} from "@/lib/auth/session-service";

/** ยืนยัน FULL session ที่ handler โดยตรงก่อนอ่าน dashboard เพื่อไม่พึ่ง Proxy หรือ branch helper เป็น security boundary */
export async function GET() {
  try {
    await requireFullSession();
    return NextResponse.json(await getDashboardData(await getCurrentBranchId()));
  } catch (error) {
    if (error instanceof SessionAuthenticationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
