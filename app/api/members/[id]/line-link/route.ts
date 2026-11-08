import { z } from "zod";
import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { LineLinkError } from "@/lib/line-link-policy";
import { getLineLinkStatus, issueLineLinkChallenge, removeLineLink } from "@/lib/line-link-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

type Context = { params: Promise<{ id: string }> };

/** รวม response ข้อผิดพลาดแบบไม่เผย DB error, token หรือ identifier */
function errorResponse(error: unknown) {
  if (error instanceof AuthorizationError || error instanceof LineLinkError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: "ข้อมูลคำขอไม่ถูกต้อง" }, { status: 400 });
  return Response.json({ error: "ไม่สามารถดำเนินการได้" }, { status: 500 });
}

/** ไม่รับ LINE ID/branch หรือ field ใดจาก client; การเชื่อมต่อจริงต้องมาจาก signed webhook */
async function assertEmptyInput(request: Request) {
  const text = await request.text();
  if (text) z.object({}).strict().parse(JSON.parse(text));
}

/** อ่าน DTO สถานะจาก service ที่ตรวจ resource branch ฝั่ง server โดยไม่คืน command ซ้ำ */
export async function GET(_request: Request, context: Context) {
  try {
    const actor = await requirePermission("members.manage");
    const memberId = z.coerce.number().int().positive().parse((await context.params).id);
    return Response.json(await getLineLinkStatus(actor, memberId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

/** ตรวจ Origin ก่อน mutation และคืน command เฉพาะการออก challenge ครั้งนี้ */
export async function POST(request: Request, context: Context) {
  try {
    try { assertTrustedOrigin(request); } catch { throw new AuthorizationError("คำขอไม่ผ่านการตรวจสอบความปลอดภัย", 403); }
    const actor = await requirePermission("members.manage");
    const memberId = z.coerce.number().int().positive().parse((await context.params).id);
    await assertEmptyInput(request);
    return Response.json(await issueLineLinkChallenge(actor, memberId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

/** ยกเลิก link/pending หลังตรวจ Origin; service จัดการ idempotency และ audit ใน transaction เดียว */
export async function DELETE(request: Request, context: Context) {
  try {
    try { assertTrustedOrigin(request); } catch { throw new AuthorizationError("คำขอไม่ผ่านการตรวจสอบความปลอดภัย", 403); }
    const actor = await requirePermission("members.manage");
    const memberId = z.coerce.number().int().positive().parse((await context.params).id);
    await assertEmptyInput(request);
    return Response.json(await removeLineLink(actor, memberId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
