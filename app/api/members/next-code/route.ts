import { db } from "@/db";
import { members } from "@/db/schema";
import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const last = await db
      .select({ memberCode: members.memberCode })
      .from(members)
      .orderBy(desc(members.id))
      .limit(1);

    let nextCode = "M00001";

    if (last.length > 0) {
      const lastCode = last[0].memberCode; // เช่น M00003
      const num = parseInt(lastCode.replace("M", "")) + 1;
      nextCode = `M${String(num).padStart(5, "0")}`;
    }

    return NextResponse.json({ code: nextCode });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}