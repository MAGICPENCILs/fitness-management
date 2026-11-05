import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthError } from "@/lib/auth/auth-errors";
import { login } from "@/lib/auth/auth-service";
import {
  AUTH_COOKIE_NAME,
  LOGIN_LIMIT_LOCK_SECONDS,
} from "@/lib/auth/constants";
import {
  assertTrustedOrigin,
  getRequestFingerprintInput,
  getSafeReturnPath,
} from "@/lib/auth/request-security";
import { getSessionCookieOptions } from "@/lib/auth/session-cookie";
import { isJsonSyntaxError } from "@/lib/http-error";
import {
  assertSchemaReady,
  SchemaNotReadyError,
} from "@/lib/system-readiness";

const loginSchema = z.object({
  staffCode: z.string().trim().min(1).max(20),
  password: z.string().min(1).max(1_024),
  returnTo: z.string().max(2_048).optional(),
  totpCode: z.string().trim().max(64).optional(),
});

const INVALID_LOGIN_MESSAGE = "รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง";
const RATE_LIMIT_MESSAGE =
  "ไม่สามารถเข้าสู่ระบบได้ชั่วคราว กรุณาลองใหม่ภายหลัง";
const AUTH_UNAVAILABLE_MESSAGE =
  "ไม่สามารถให้บริการยืนยันตัวตนได้ชั่วคราว";
const SCHEMA_NOT_READY_MESSAGE =
  "ฐานข้อมูลระบบยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ";

/** แปลงข้อผิดพลาด Login เป็นข้อความกลาง และใช้ Retry-After คงที่เพื่อไม่เปิดเผยเวลาปลดล็อกเฉพาะบัญชี */
export function loginErrorResponse(error: unknown): NextResponse {
  if (error instanceof SchemaNotReadyError) {
    return NextResponse.json(
      { code: "SCHEMA_NOT_READY", error: SCHEMA_NOT_READY_MESSAGE },
      { status: 503 },
    );
  }

  if (error instanceof AuthError) {
    if (error.code === "RATE_LIMITED") {
      return NextResponse.json(
        { error: RATE_LIMIT_MESSAGE },
        {
          status: 429,
          headers: { "Retry-After": String(LOGIN_LIMIT_LOCK_SECONDS) },
        },
      );
    }
    if (error.code === "INVALID_CREDENTIALS") {
      return NextResponse.json(
        { error: INVALID_LOGIN_MESSAGE },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: AUTH_UNAVAILABLE_MESSAGE },
      { status: error.status },
    );
  }

  if (error instanceof z.ZodError || isJsonSyntaxError(error)) {
    return NextResponse.json(
      { error: "ข้อมูลเข้าสู่ระบบไม่ถูกต้อง" },
      { status: 400 },
    );
  }
  if (error instanceof Error && error.message === "Untrusted origin") {
    return NextResponse.json(
      { error: "ไม่สามารถดำเนินการได้" },
      { status: 403 },
    );
  }

  console.error(
    "Login route unavailable",
    error instanceof Error ? error.name : "UNKNOWN_ERROR",
  );
  return NextResponse.json({ error: AUTH_UNAVAILABLE_MESSAGE }, { status: 500 });
}

/** ตรวจ Origin, payload และ schema ก่อนเรียก service เพื่อไม่สร้าง rate-limit/audit จากความผิดพลาดของ deployment */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertTrustedOrigin(request);
    const input = loginSchema.parse(await request.json());
    await assertSchemaReady();
    const result = await login(
      { ...input, returnTo: getSafeReturnPath(input.returnTo) },
      getRequestFingerprintInput(request),
    );
    (await cookies()).set({
      name: AUTH_COOKIE_NAME,
      value: result.sessionCookie,
      ...getSessionCookieOptions(),
    });
    return NextResponse.json({ returnTo: result.returnTo });
  } catch (error) {
    return loginErrorResponse(error);
  }
}
