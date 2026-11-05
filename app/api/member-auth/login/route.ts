import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertTrustedOrigin, getRequestFingerprintInput } from "@/lib/auth/request-security";
import { getMemberSessionCookieOptions, MEMBER_SESSION_COOKIE } from "@/lib/member-auth/session";
import { loginMember, MEMBER_LOGIN_LOCK_SECONDS, MemberPortalError } from "@/lib/member-portal-service";

const loginSchema = z.object({ email: z.string().trim().email().max(191), password: z.string().min(1).max(1024) });

/** Login สมาชิกด้วยข้อความ credential failure แบบเดียวเพื่อกัน account enumeration */
export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    const input = loginSchema.parse(await request.json());
    const session = await loginMember(input.email, input.password, getRequestFingerprintInput(request));
    (await cookies()).set({ name: MEMBER_SESSION_COOKIE, value: session.token, ...getMemberSessionCookieOptions() });
    return NextResponse.json({ returnTo: "/member" });
  } catch (error) {
    if (error instanceof Error && error.message === "Untrusted origin") return NextResponse.json({ error: "ไม่สามารถดำเนินการได้" }, { status: 403 });
    if (error instanceof MemberPortalError && error.code === "RATE_LIMITED") return NextResponse.json({ error: "ไม่สามารถเข้าสู่ระบบได้ชั่วคราว กรุณาลองใหม่ภายหลัง" }, { status: 429, headers: { "Retry-After": String(MEMBER_LOGIN_LOCK_SECONDS) } });
    if (error instanceof MemberPortalError || error instanceof z.ZodError) return NextResponse.json({ error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
    console.error("member login unavailable");
    return NextResponse.json({ error: "ไม่สามารถเข้าสู่ระบบได้" }, { status: 500 });
  }
}
