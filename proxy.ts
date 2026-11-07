import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { decideRouteAccess } from "@/lib/auth/route-policy";
import { verifySessionClaims } from "@/lib/auth/session-token";
import { assertTrustedOrigin } from "@/lib/auth/request-security";

const LOGIN_REQUIRED_MESSAGE = "กรุณาเข้าสู่ระบบ";
const PASSWORD_CHANGE_REQUIRED_MESSAGE =
  "กรุณาเปลี่ยนรหัสผ่านก่อนใช้งานระบบ";

/** บันทึกเฉพาะสถานะของ auth boundary ใน development โดยไม่แตะ cookie, claims หรือข้อมูลพนักงาน */
function logAuthDiagnostic(status: string): void {
  if (process.env.NODE_ENV === "development") {
    console.info("[auth-diagnostic]", status);
  }
}

/** สร้าง returnTo จาก path/query ภายใน request เท่านั้น จึงไม่รับ origin ภายนอกหรือค่าจาก input โดยตรง */
function currentReturnPath(request: NextRequest): string {
  return `${request.nextUrl.pathname}${request.nextUrl.search}`;
}

/** กัน optimizer เก็บรูปสมาชิกและตรวจ Origin ของ upload ก่อน cookie; รูป opaque อ่านผ่าน runtime handler แบบ public */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/_next/image") {
    try {
      const target = new URL(request.nextUrl.searchParams.get("url") ?? "", request.url);
      const photoPath = new URL(decodeURIComponent(target.pathname), request.url).pathname;
      if (/^\/(member-photos|uploads\/members)(\/|$)/.test(photoPath))
        return NextResponse.json({ error: "ไม่พบรูปสมาชิก" }, { status: 404 });
    } catch {
      // URL ที่ผิดรูปแบบยังให้ optimizer เดิมเป็นผู้ตรวจและปฏิเสธ โดยไม่ตรวจ session เพิ่ม
    }
    return NextResponse.next();
  }
  if (pathname === "/api/upload" && request.method === "POST") {
    try {
      assertTrustedOrigin(request);
    } catch {
      return NextResponse.json({ error: "คำขอไม่ผ่านการตรวจสอบความปลอดภัย" }, { status: 403 });
    }
  }
  if (pathname.startsWith("/member-photos/")) return NextResponse.next();
  const cookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const claims = cookie ? await verifySessionClaims(cookie) : null;

  logAuthDiagnostic(
    !cookie
      ? "PROXY_COOKIE_MISSING"
      : claims
        ? "PROXY_CLAIMS_VALID"
        : "PROXY_CLAIMS_INVALID",
  );

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
  matcher: ["/_next/image", "/((?!_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)"],
};
