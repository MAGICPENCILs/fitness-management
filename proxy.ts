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

/** ปิด raw/filename/optimizer รวม casing ที่ filesystem บน Windows มองเท่ากันก่อน cookie; gateway ตรวจ session ใน handler */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  let pathname = request.nextUrl.pathname;
  try {
    // Next จับคู่ public files กับ decoded path ด้วย จึงต้องปิด encoded alias ก่อนอ่าน cookie เช่นกัน
    pathname = new URL(decodeURIComponent(pathname), request.url).pathname;
  } catch {
    // path ที่ decode ไม่ได้ยังตรวจ raw prefix ได้ และ router จะปฏิเสธส่วนที่ผิดรูปแบบ
  }
  const hiddenPhoto = () => NextResponse.json({ error: "ไม่พบรูปสมาชิก" }, {
    status: 404,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
  if (/^\/uploads\/(members|privacy-cleanup)(\/|$)/i.test(pathname)) return hiddenPhoto();
  if (pathname.toLowerCase() === "/_next/image") {
    try {
      const target = new URL(request.nextUrl.searchParams.get("url") ?? "", request.url);
      const photoPath = new URL(decodeURIComponent(target.pathname), request.url).pathname;
      if (/^\/(member-photos|uploads\/(members|privacy-cleanup))(\/|$)/i.test(photoPath))
        return hiddenPhoto();
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
  if (/^\/member-photos(\/|$)/i.test(pathname)) {
    if (/^\/member-photos\/by-member\//i.test(pathname)) return NextResponse.next();
    return hiddenPhoto();
  }
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
  // matcher ถูกวิเคราะห์แบบ static และไม่คง flag i จึงต้องระบุ casing ใน pattern เพื่อครอบคลุมไฟล์บน Windows
  matcher: [
    "/([uU][pP][lL][oO][aA][dD][sS])/([mM][eE][mM][bB][eE][rR][sS]|[pP][rR][iI][vV][aA][cC][yY]-[cC][lL][eE][aA][nN][uU][pP])/:path*",
    "/([mM][eE][mM][bB][eE][rR]-[pP][hH][oO][tT][oO][sS])/:path*",
    "/_next/image",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)",
  ],
};
