import { NextResponse } from "next/server";
import { z } from "zod";

import { assertTrustedOrigin } from "@/lib/auth/request-security";
import {
  clearLoginLimit,
  SecurityOperationError,
} from "@/lib/auth/security-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const idSchema = z.coerce.number().int().positive();

/** clear rate-limit bucket ด้วย id ภายในระบบ โดยไม่รับ subject hash หรือ Staff code จาก client */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertTrustedOrigin(request);
    const actor = await requirePermission("auth.security.manage", undefined, {
      action: "AUTH_RATE_LIMIT_CLEARED",
      entityType: "AUTH_LOGIN_LIMIT",
    });
    await clearLoginLimit(actor, idSchema.parse((await params).id));
    return NextResponse.json({ message: "ปลดล็อก rate limit แล้ว" });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: "รหัส rate limit ไม่ถูกต้อง" }, { status: 400 });
    if (error instanceof Error && error.message === "Untrusted origin")
      return NextResponse.json({ error: "ไม่สามารถดำเนินการได้" }, { status: 403 });
    if (error instanceof AuthorizationError || error instanceof SecurityOperationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Security rate-limit clear unavailable", error instanceof Error ? error.name : "UNKNOWN_ERROR");
    return NextResponse.json({ error: "ไม่สามารถปลดล็อก rate limit ได้" }, { status: 500 });
  }
}
