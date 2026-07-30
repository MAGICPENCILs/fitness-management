import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentBranchId } from "@/lib/branch-service";
import {
  PrivacyOperationError,
  retryPrivacyFileCleanup,
} from "@/lib/privacy-service";
import {
  consumePrivacyLimit,
  PrivacyRateLimitError,
} from "@/lib/privacy-rate-limit";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

/** retry การลบรูปที่ค้างเฉพาะผู้มีสิทธิ์อนุมัติ และจำกัดความถี่ต่อ staff */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("privacy.request.approve", branchId, {
      action: "PRIVACY_CLEANUP_RETRIED",
      entityType: "PRIVACY_REQUEST",
    });
    consumePrivacyLimit(`staff:${actor.staffId}`);
    const requestId = z.coerce.number().int().positive().parse((await params).id);
    await retryPrivacyFileCleanup(requestId, actor);
    return NextResponse.json({ message: "retry cleanup สำเร็จ" });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: "รหัสคำขอไม่ถูกต้อง" }, { status: 400 });
    if (
      error instanceof AuthorizationError ||
      error instanceof PrivacyOperationError ||
      error instanceof PrivacyRateLimitError
    )
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json(
      { error: "ไม่สามารถ retry cleanup ได้" },
      { status: 500 },
    );
  }
}
