import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getSecurityDashboard,
  SecurityOperationError,
} from "@/lib/auth/security-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });

const filtersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  branchId: z.coerce.number().int().positive().optional(),
  staffId: z.coerce.number().int().positive().optional(),
  action: z
    .enum([
      "LOGIN_SUCCESS",
      "LOGIN_FAILED",
      "LOGIN_RATE_LIMITED",
      "LOGOUT_SUCCESS",
      "SESSION_EXPIRED",
      "SESSION_REVOKED",
      "PASSWORD_CHANGED",
      "PASSWORD_RESET",
      "AUTH_RATE_LIMIT_CLEARED",
    ])
    .optional(),
  result: z.enum(["SUCCESS", "DENIED", "FAILED"]).optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

/** โหลด security dashboard ผ่าน FULL-session permission และแปลง query เป็นค่าที่จำกัดขนาดก่อนเรียก service */
export async function GET(request: Request) {
  try {
    const actor = await requirePermission("auth.security.read", undefined, {
      action: "AUTH_SECURITY_READ",
      entityType: "AUTH_SECURITY",
    });
    const parsed = filtersSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return NextResponse.json(
      await getSecurityDashboard(actor, {
        ...parsed,
        from: parsed.from
          ? new Date(`${parsed.from}T00:00:00.000Z`)
          : undefined,
        to: parsed.to
          ? new Date(`${parsed.to}T23:59:59.999Z`)
          : undefined,
      }),
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "ตัวกรองความปลอดภัยไม่ถูกต้อง" },
        { status: 400 },
      );
    }
    if (
      error instanceof AuthorizationError ||
      error instanceof SecurityOperationError
    ) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(
      "Security dashboard route unavailable",
      error instanceof Error ? error.name : "UNKNOWN_ERROR",
    );
    return NextResponse.json(
      { error: "ไม่สามารถโหลดข้อมูลความปลอดภัยได้" },
      { status: 500 },
    );
  }
}
