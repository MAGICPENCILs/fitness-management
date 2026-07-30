import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentBranchId } from "@/lib/branch-service";
import {
  PrivacyOperationError,
  reviewPrivacyRequest,
} from "@/lib/privacy-service";
import {
  consumePrivacyLimit,
  PrivacyRateLimitError,
} from "@/lib/privacy-rate-limit";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const reviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().trim().max(2000).optional(),
});

/** อนุมัติหรือปฏิเสธคำขอโดยบังคับ rate limit และ separation of duties ฝั่ง service */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("privacy.request.approve", branchId, {
      action: "PRIVACY_REQUEST_REVIEWED",
      entityType: "PRIVACY_REQUEST",
    });
    consumePrivacyLimit(`staff:${actor.staffId}`);
    const requestId = z.coerce.number().int().positive().parse((await params).id);
    const input = reviewSchema.parse(await request.json());
    await reviewPrivacyRequest(requestId, input, actor);
    return NextResponse.json({ message: "บันทึกผลพิจารณาคำขอแล้ว" });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "ข้อมูลการพิจารณาไม่ถูกต้อง" },
        { status: 400 },
      );
    if (
      error instanceof AuthorizationError ||
      error instanceof PrivacyOperationError ||
      error instanceof PrivacyRateLimitError
    )
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถพิจารณาคำขอได้" }, { status: 500 });
  }
}
