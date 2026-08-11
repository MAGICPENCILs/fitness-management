import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/dashboard-data";
import { getCurrentBranchId } from "@/lib/branch-service";
import { AuthorizationError } from "@/lib/staff-service";

export async function GET() {
  try {
    return NextResponse.json(await getDashboardData(await getCurrentBranchId()));
  } catch (error) {
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
