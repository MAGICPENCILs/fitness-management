import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/dashboard-data";
import { getCurrentBranchId } from "@/lib/branch-service";

export async function GET() {
  try {
    return NextResponse.json(await getDashboardData(await getCurrentBranchId()));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
