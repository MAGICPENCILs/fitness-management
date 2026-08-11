import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  StaffOperationError,
  setCurrentStaffCookie,
} from "@/lib/staff-service";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import {
  assertTrustedOrigin,
  getRequestFingerprintInput,
} from "@/lib/auth/request-security";
import { getSessionCookieOptions } from "@/lib/auth/session-cookie";

const selectionSchema = z.object({
  staffId: z.coerce.number().int().positive(),
});

/** ซ่อน endpoint ก่อนอ่าน request แล้วหมุน authoritative session เฉพาะ development ที่ opt in */
export async function POST(request: Request) {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.ENABLE_DEV_STAFF_SWITCHER !== "true"
  ) {
    return NextResponse.json({ error: "ไม่พบการทำงานนี้" }, { status: 404 });
  }
  try {
    assertTrustedOrigin(request);
    const { staffId } = selectionSchema.parse(await request.json());
    const result = await setCurrentStaffCookie(
      staffId,
      getRequestFingerprintInput(request),
    );
    const cookieStore = await cookies();
    cookieStore.set({
      name: AUTH_COOKIE_NAME,
      value: result.sessionCookie,
      ...getSessionCookieOptions(),
    });
    cookieStore.delete("fitness_staff_id");
    return NextResponse.json({ message: "เปลี่ยนบัญชีพนักงานแล้ว" });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return NextResponse.json({ error: "รหัสพนักงานไม่ถูกต้อง" }, { status: 400 });
    if (error instanceof Error && error.message === "Untrusted origin")
      return NextResponse.json({ error: "ไม่สามารถดำเนินการได้" }, { status: 403 });
    if (error instanceof StaffOperationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถเปลี่ยนบัญชีพนักงานได้" }, { status: 500 });
  }
}
