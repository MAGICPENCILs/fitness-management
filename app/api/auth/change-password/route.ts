import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthError } from "@/lib/auth/auth-errors";
import { changeOwnPassword } from "@/lib/auth/auth-service";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import {
  assertTrustedOrigin,
  getRequestFingerprintInput,
} from "@/lib/auth/request-security";
import { getSessionCookieOptions } from "@/lib/auth/session-cookie";
import {
  requireSession,
  SessionAuthenticationError,
} from "@/lib/auth/session-service";
import { isJsonSyntaxError } from "@/lib/http-error";

const changePasswordSchema = z
  .object({
    password: z.string().min(1).max(1_024),
    confirmation: z.string().min(1).max(1_024),
  })
  .refine((input) => input.password === input.confirmation, {
    path: ["confirmation"],
  });

/** ตอบข้อผิดพลาดแบบกลางเพื่อไม่เปิดเผยสถานะ session หรือรายละเอียด policy มากกว่าที่หน้าจอต้องใช้ */
function changePasswordErrorResponse(error: unknown): NextResponse {
  if (error instanceof z.ZodError || isJsonSyntaxError(error)) {
    return NextResponse.json(
      { error: "ข้อมูลรหัสผ่านไม่ถูกต้อง" },
      { status: 400 },
    );
  }
  if (error instanceof Error && error.message === "Untrusted origin") {
    return NextResponse.json(
      { error: "ไม่สามารถดำเนินการได้" },
      { status: 403 },
    );
  }
  if (error instanceof SessionAuthenticationError) {
    return NextResponse.json(
      { error: "เซสชันไม่สามารถใช้งานได้" },
      { status: error.status },
    );
  }
  if (error instanceof AuthError) {
    const status = error.code === "INVALID_PASSWORD" ? 400 : error.status;
    return NextResponse.json(
      {
        error:
          status === 400
            ? "รหัสผ่านไม่เป็นไปตามนโยบาย"
            : "เซสชันไม่สามารถใช้งานได้",
      },
      { status },
    );
  }

  console.error(
    "Change password route unavailable",
    error instanceof Error ? error.name : "UNKNOWN_ERROR",
  );
  return NextResponse.json(
    { error: "ไม่สามารถเปลี่ยนรหัสผ่านได้ชั่วคราว" },
    { status: 500 },
  );
}

/** ตรวจ forced session และ Origin ก่อนเปลี่ยน hash แล้วแทน cookie ด้วย FULL session ที่หมุนใหม่ */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertTrustedOrigin(request);
    const input = changePasswordSchema.parse(await request.json());
    const session = await requireSession({ allowPasswordChange: true });
    const result = await changeOwnPassword(
      session,
      input.password,
      getRequestFingerprintInput(request),
    );
    (await cookies()).set({
      name: AUTH_COOKIE_NAME,
      value: result.sessionCookie,
      ...getSessionCookieOptions(),
    });
    return NextResponse.json({ returnTo: "/" });
  } catch (error) {
    return changePasswordErrorResponse(error);
  }
}
