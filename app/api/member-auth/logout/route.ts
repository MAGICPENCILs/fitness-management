import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { logoutMemberSession } from "@/lib/member-auth/service";
import { MEMBER_SESSION_COOKIE } from "@/lib/member-auth/session";

/** revoke Member session แล้วลบ cookie แยกจาก Staff logout */
export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    const store = await cookies();
    await logoutMemberSession(store.get(MEMBER_SESSION_COOKIE)?.value);
    store.delete(MEMBER_SESSION_COOKIE);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Untrusted origin") return NextResponse.json({ error: "ไม่สามารถดำเนินการได้" }, { status: 403 });
    return NextResponse.json({ error: "ไม่สามารถออกจากระบบได้" }, { status: 500 });
  }
}
