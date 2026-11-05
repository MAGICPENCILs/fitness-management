import { NextResponse } from "next/server";

import { getSystemReadiness } from "@/lib/system-readiness";

/** เปิดเผยเฉพาะสถานะที่ monitor ใช้ได้ โดยไม่ส่ง error, SQL หรือรายละเอียดการเชื่อมต่อฐานข้อมูล */
export async function GET(): Promise<NextResponse> {
  const readiness = await getSystemReadiness();

  if (readiness.status === "READY") {
    return NextResponse.json({
      status: "ok",
      checks: { database: "ok", schema: "ok" },
    });
  }

  if (readiness.status === "OUTDATED") {
    return NextResponse.json(
      {
        status: "degraded",
        checks: { database: "ok", schema: "outdated" },
        requiredMigration: readiness.requiredMigration,
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      status: "unavailable",
      checks: { database: "unavailable", schema: "unknown" },
    },
    { status: 503 },
  );
}
