import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { getMemberSessionCookieOptions, MEMBER_SESSION_COOKIE } from "@/lib/member-auth/session";
import { loginMember, MemberPortalError } from "@/lib/member-portal-service";

const loginSchema = z.object({ email: z.string().trim().email().max(191), password: z.string().min(1).max(1024) });

/** Login สมาชิกด้วยข้อความ credential failure แบบเดียวเพื่อกัน account enumeration */
export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    const input = loginSchema.parse(await request.json());
    const session = await loginMember(input.email, input.password);
    (await cookies()).set({ name: MEMBER_SESSION_COOKIE, value: session.token, ...getMemberSessionCookieOptions() });
    return NextResponse.json({ returnTo: "/member" });
  } catch (error) {
    if (error instanceof Error && error.message === "Untrusted origin") return NextResponse.json({ error: "ไม่สามารถดำเนินการได้" }, { status: 403 });
    if (error instanceof MemberPortalError || error instanceof z.ZodError) return NextResponse.json({ error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
    console.error("member login unavailable");
    return NextResponse.json({ error: "ไม่สามารถเข้าสู่ระบบได้" }, { status: 500 });
  }
}
