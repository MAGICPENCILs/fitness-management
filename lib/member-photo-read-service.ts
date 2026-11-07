import "server-only";

import { readFile } from "fs/promises";
import path from "path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { members } from "@/db/schema";
import { requireFullSession } from "@/lib/auth/session-service";
import { resolveMemberPhotoPaths } from "@/lib/member-photo-path";
import { getMemberConsentSnapshot } from "@/lib/privacy-service";
import { hasPermission, type ActorContext } from "@/lib/rbac";

/** อ่านหลังยืนยัน staff/resource/consent ปัจจุบันเท่านั้น; ไฟล์ซ้ำหรือ reference กำกวมต้องปิดไว้รอตรวจสอบ */
export async function readMemberPhoto(id: string) {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) return null;
  let actor: ActorContext;
  try {
    actor = await requireFullSession();
  } catch {
    // ไม่ส่งสาเหตุ session ออกไปให้แยกสมาชิกหรือสถานะบัญชีจาก HTTP ได้
    return null;
  }
  const memberId = Number(id);
  const [member] = await db.select({ homeBranchId: members.homeBranchId, status: members.status, photoUrl: members.photoUrl })
    .from(members).where(eq(members.id, memberId)).limit(1);
  if (!member || member.status === "CANCELLED" || !member.photoUrl) return null;
  if (!hasPermission(actor, "members.manage", member.homeBranchId) && !hasPermission(actor, "access.manage", member.homeBranchId)) return null;
  const candidates = resolveMemberPhotoPaths(member.photoUrl);
  const contentTypes: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
  const contentType = contentTypes[path.extname(member.photoUrl).toLowerCase()];
  if (!candidates || !contentType) return null;
  const consent = await getMemberConsentSnapshot(memberId);
  if (!consent.current.PHOTO) return null;
  let bytes: Buffer | undefined;
  for (const candidate of candidates) {
    try {
      const found = await readFile(candidate);
      if (bytes) return null;
      bytes = found;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return bytes ? { bytes, contentType } : null;
}
