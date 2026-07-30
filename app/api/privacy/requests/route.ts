import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentBranchId } from "@/lib/branch-service";
import {
  createPrivacyRequest,
  getPrivacyRequests,
  PrivacyOperationError,
} from "@/lib/privacy-service";
import {
  consumePrivacyLimit,
  PrivacyRateLimitError,
} from "@/lib/privacy-rate-limit";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const createSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(5, "กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร").max(2000),
});

const listSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "COMPLETED", "REJECTED"]).optional(),
  branchId: z.coerce.number().int().positive().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** โหลดคำขอ privacy พร้อม filter และ pagination ตามขอบเขตสาขาของ actor */
export async function GET(request: Request) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("privacy.request.create", branchId, {
      action: "PRIVACY_REQUEST_READ",
      entityType: "PRIVACY_REQUEST",
    });
    const url = new URL(request.url);
    const filters = listSchema.parse(Object.fromEntries(url.searchParams));
    return NextResponse.json(
      await getPrivacyRequests(actor, {
        ...filters,
        from: filters.from ? new Date(`${filters.from}T00:00:00`) : undefined,
        to: filters.to ? new Date(`${filters.to}T23:59:59.999`) : undefined,
      }),
    );
  } catch (error) {
    return privacyRequestError(error, "ไม่สามารถโหลดคำขอ privacy ได้");
  }
}

/** สร้างคำขอ anonymization หลังใช้โควตาต่อพนักงานและตรวจ member branch */
export async function POST(request: Request) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("privacy.request.create", branchId, {
      action: "PRIVACY_REQUEST_CREATED",
      entityType: "PRIVACY_REQUEST",
    });
    consumePrivacyLimit(`staff:${actor.staffId}`);
    const input = createSchema.parse(await request.json());
    const id = await createPrivacyRequest(input, actor);
    return NextResponse.json({ message: "สร้างคำขอ anonymization แล้ว", id }, { status: 201 });
  } catch (error) {
    return privacyRequestError(error, "ไม่สามารถสร้างคำขอ privacy ได้");
  }
}

/** แปลงข้อผิดพลาด privacy request เป็น response มาตรฐานโดยไม่คืนเหตุผลภายใน */
function privacyRequestError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError)
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "ข้อมูลคำขอไม่ถูกต้อง" },
      { status: 400 },
    );
  if (
    error instanceof AuthorizationError ||
    error instanceof PrivacyOperationError ||
    error instanceof PrivacyRateLimitError
  )
    return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
