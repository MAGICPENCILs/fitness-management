import { assertTrustedOrigin } from "@/lib/auth/request-security";
import { LineLinkError, readLineWebhookBody } from "@/lib/line-link-policy";
import { getLineProviderSettingsDto, LineProviderSettingsError, updateLineProviderSettings } from "@/lib/line-provider-settings-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

/** ห้าม cache แม้แต่สถานะผิดพลาดของ credential endpoint */
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

/** ไม่เผยข้อความจาก auth/storage/crypto ที่อาจพกข้อมูลส่วนตัวหรือ SQL */
function failure(error: unknown) {
  if (error instanceof LineProviderSettingsError) return json({ error: error.message }, error.status);
  if (error instanceof AuthorizationError) return json({ error: error.status === 401 ? "กรุณาเข้าสู่ระบบ" : "บัญชีนี้ไม่มีสิทธิ์ดำเนินการ" }, error.status);
  return json({ error: "การตั้งค่า LINE ยังไม่พร้อมใช้งาน" }, 503);
}

/** Owner เท่านั้นที่ได้รับ destination และสถานะการตั้งค่า */
export async function GET() {
  try {
    const actor = await requirePermission("provider.credentials.manage");
    return json(await getLineProviderSettingsDto(actor));
  } catch (error) { return failure(error); }
}

/** ตรวจ Origin และ session ก่อนอ่าน credential; จำกัด bytes จริงแม้ client แจ้งขนาดไม่ตรง */
export async function PATCH(request: Request) {
  try { assertTrustedOrigin(request); }
  catch { return json({ error: "คำขอไม่ผ่านการตรวจสอบความปลอดภัย" }, 403); }
  try {
    const actor = await requirePermission("provider.credentials.manage");
    let input: unknown;
    try { input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await readLineWebhookBody(request))); }
    catch (error) {
      if (error instanceof LineLinkError && error.status === 413) return json({ error: "คำขอมีขนาดใหญ่เกินไป" }, 413);
      return json({ error: "ข้อมูลการตั้งค่า LINE ไม่ถูกต้อง" }, 400);
    }
    return json(await updateLineProviderSettings(actor, input));
  } catch (error) { return failure(error); }
}
