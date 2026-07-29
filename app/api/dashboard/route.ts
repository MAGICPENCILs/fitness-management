import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/dashboard-data";

export async function GET() {
  try {
    return NextResponse.json(await getDashboardData());
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
