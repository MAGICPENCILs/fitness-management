import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentBranchId } from "@/lib/branch-service";
import {
  appendConsentEvent,
  getMemberConsentSnapshot,
  PrivacyOperationError,
} from "@/lib/privacy-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const consentSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  consentType: z.enum(["SERVICE_PRIVACY", "MARKETING", "PHOTO"]),
  action: z.enum(["GRANTED", "WITHDRAWN"]),
  policyVersion: z.string().trim().min(1).max(30),
  note: z.string().trim().max(1000).optional(),
});

/** คืน consent ปัจจุบันและ event history หลังตรวจขอบเขตสาขา */
export async function GET(request: Request) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("privacy.consent.manage", branchId, {
      action: "CONSENT_READ",
      entityType: "CONSENT",
    });
    const memberId = z.coerce
      .number()
      .int()
      .positive()
      .parse(new URL(request.url).searchParams.get("memberId"));
    return NextResponse.json(await getMemberConsentSnapshot(memberId, actor));
  } catch (error) {
    return consentErrorResponse(error, "ไม่สามารถโหลด consent ได้");
  }
}

/** เพิ่ม consent event ใหม่โดยไม่แก้หรือลบ event เก่า */
export async function POST(request: Request) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("privacy.consent.manage", branchId, {
      action: "CONSENT_CHANGED",
      entityType: "CONSENT",
    });
    const input = consentSchema.parse(await request.json());
    const id = await appendConsentEvent(input, actor);
    return NextResponse.json({ message: "บันทึก consent แล้ว", id }, { status: 201 });
  } catch (error) {
    return consentErrorResponse(error, "ไม่สามารถบันทึก consent ได้");
  }
}

/** แปลงข้อผิดพลาด consent เป็น response โดยไม่ส่งข้อมูลภายในหรือ PII กลับไป */
function consentErrorResponse(error: unknown, fallback: string) {
  if (error instanceof z.ZodError)
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "ข้อมูล consent ไม่ถูกต้อง" },
      { status: 400 },
    );
  if (error instanceof AuthorizationError || error instanceof PrivacyOperationError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
