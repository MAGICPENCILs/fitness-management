import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { decideRouteAccess } from "@/lib/auth/route-policy";
import { verifySessionClaims } from "@/lib/auth/session-token";

const LOGIN_REQUIRED_MESSAGE = "กรุณาเข้าสู่ระบบ";
const FORBIDDEN_MESSAGE = "บัญชีนี้ไม่มีสิทธิ์เข้าถึงหน้านี้";

/** สร้าง returnTo จาก path/query ภายใน request เท่านั้น จึงไม่รับ origin ภายนอกหรือค่าจาก input โดยตรง */
function currentReturnPath(request: NextRequest): string {
  return `${request.nextUrl.pathname}${request.nextUrl.search}`;
}

/** ทำ optimistic auth check ก่อน render โดยให้ Route Handler และ DAL เป็น security boundary ตัวจริง */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const cookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const claims = cookie ? await verifySessionClaims(cookie) : null;
  const pathname = request.nextUrl.pathname;

  if ((pathname === "/login" || pathname === "/change-password") && claims) {
    if (
      claims.mode === "FULL" &&
      claims.expiresAt > Math.floor(Date.now() / 1_000)
    ) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

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
    return NextResponse.redirect(new URL("/change-password", request.url));
  }

  return new NextResponse(FORBIDDEN_MESSAGE, {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)"],
};
