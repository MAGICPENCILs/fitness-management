import { NextResponse } from "next/server";
import { z } from "zod";

import { assertTrustedOrigin } from "@/lib/auth/request-security";
import {
  revokeStaffSessions,
  SecurityOperationError,
} from "@/lib/auth/security-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const idSchema = z.coerce.number().int().positive();

/** revoke session ทั้งหมดของ Staff เป้าหมาย โดย service ตรวจ role/branch ซ้ำจากฐานข้อมูล */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertTrustedOrigin(request);
    const actor = await requirePermission("auth.security.manage", undefined, {
      action: "SESSION_REVOKED",
      entityType: "STAFF",
    });
    await revokeStaffSessions(actor, idSchema.parse((await params).id));
    return NextResponse.json({ message: "ยกเลิก session ของพนักงานแล้ว" });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: "รหัสพนักงานไม่ถูกต้อง" }, { status: 400 });
    if (error instanceof Error && error.message === "Untrusted origin")
      return NextResponse.json({ error: "ไม่สามารถดำเนินการได้" }, { status: 403 });
    if (error instanceof AuthorizationError || error instanceof SecurityOperationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Security staff revoke unavailable", error instanceof Error ? error.name : "UNKNOWN_ERROR");
    return NextResponse.json({ error: "ไม่สามารถยกเลิก session ของพนักงานได้" }, { status: 500 });
  }
}
