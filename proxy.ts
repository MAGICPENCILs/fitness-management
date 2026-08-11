import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { decideRouteAccess } from "@/lib/auth/route-policy";
import { verifySessionClaims } from "@/lib/auth/session-token";

const LOGIN_REQUIRED_MESSAGE = "กรุณาเข้าสู่ระบบ";
const PASSWORD_CHANGE_REQUIRED_MESSAGE =
  "กรุณาเปลี่ยนรหัสผ่านก่อนใช้งานระบบ";

/** สร้าง returnTo จาก path/query ภายใน request เท่านั้น จึงไม่รับ origin ภายนอกหรือค่าจาก input โดยตรง */
function currentReturnPath(request: NextRequest): string {
  return `${request.nextUrl.pathname}${request.nextUrl.search}`;
}

/** ทำ optimistic auth check ก่อน render โดยให้ Route Handler และ DAL เป็น security boundary ตัวจริง */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const cookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const claims = cookie ? await verifySessionClaims(cookie) : null;
  const pathname = request.nextUrl.pathname;

  const decision = decideRouteAccess(pathname, claims);
  if (decision.type === "ALLOW") return NextResponse.next();

  if (decision.type === "LOGIN") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: LOGIN_REQUIRED_MESSAGE }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("returnTo", currentReturnPath(request));
    return NextResponse.redirect(loginUrl);
  }

  if (decision.type === "CHANGE_PASSWORD") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: PASSWORD_CHANGE_REQUIRED_MESSAGE },
        { status: 403 },
      );
    }
    return NextResponse.redirect(new URL("/change-password", request.url));
  }

  return NextResponse.redirect(new URL("/forbidden", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)"],
};
