import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { logout } from "@/lib/auth/auth-service";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import {
  assertTrustedOrigin,
  getRequestFingerprintInput,
} from "@/lib/auth/request-security";

/** Revoke session ฝั่งฐานข้อมูลให้เสร็จก่อนลบ cookie เพื่อไม่ทิ้ง token ที่ยังใช้งานได้เมื่อ mutation ล้มเหลว */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertTrustedOrigin(request);
    const cookieStore = await cookies();
    await logout(
      cookieStore.get(AUTH_COOKIE_NAME)?.value,
      getRequestFingerprintInput(request),
    );
    cookieStore.delete(AUTH_COOKIE_NAME);
    return NextResponse.json({ message: "ออกจากระบบแล้ว" });
  } catch (error) {
    if (error instanceof Error && error.message === "Untrusted origin") {
      return NextResponse.json(
        { error: "ไม่สามารถดำเนินการได้" },
        { status: 403 },
      );
    }
    console.error(
      "Logout route unavailable",
      error instanceof Error ? error.name : "UNKNOWN_ERROR",
    );
    return NextResponse.json(
      { error: "ไม่สามารถออกจากระบบได้ชั่วคราว" },
      { status: 500 },
    );
  }
}
