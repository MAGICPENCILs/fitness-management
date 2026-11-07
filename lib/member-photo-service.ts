import "server-only";

import { randomBytes } from "crypto";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { and, eq } from "drizzle-orm";
import { members } from "@/db/schema";
import { runAuditedMutation } from "@/lib/audit-service";
import { getMemberConsentSnapshot } from "@/lib/privacy-service";
import { hasPermission, type ActorContext } from "@/lib/rbac";

export class MemberPhotoError extends Error {
  /** คืนเฉพาะข้อความคงที่และสถานะ HTTP โดยไม่เปิดเผยข้อมูลสมาชิกหรือ filesystem */
  constructor(message: string, public status: number) {
    super(message);
    this.name = "MemberPhotoError";
  }
}

/** ชดเชยไฟล์ใหม่หรือล้างรูปเก่าโดยไม่ปล่อย raw error ที่อาจมี path เข้า log */
async function cleanupPhoto(filePath: string) {
  try {
    await unlink(filePath);
  } catch {
    console.error("MEMBER_PHOTO_CLEANUP_FAILED");
  }
}

/** ตรวจชนิดและ consent ก่อนบันทึกรูปกับ Audit ใน transaction เดียว และชดเชยไฟล์เมื่อ rollback */
export async function saveMemberPhoto(input: {
  actor: ActorContext;
  branchId: number;
  memberId: number;
  file: File;
}): Promise<{ url: string }> {
  const { actor, branchId, memberId, file } = input;
  if (!hasPermission(actor, "members.manage", branchId))
    throw new MemberPhotoError("ไม่มีสิทธิ์อัปโหลดรูปสมาชิก", 403);
  if (!Number.isSafeInteger(memberId) || memberId <= 0)
    throw new MemberPhotoError("ข้อมูลอัปโหลดไม่ถูกต้อง", 400);
  const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const extension = Object.hasOwn(extensions, file.type) ? extensions[file.type] : undefined;
  if (!extension || file.size < 1 || file.size > 5 * 1024 * 1024)
    throw new MemberPhotoError("ไฟล์รูปไม่ถูกต้อง", 400);
  const buffer = Buffer.from(await file.arrayBuffer());
  const validSignature = file.type === "image/jpeg"
    ? buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    : file.type === "image/png"
      ? buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
      : buffer.length >= 12 && buffer.subarray(0, 4).equals(Buffer.from("RIFF")) && buffer.subarray(8, 12).equals(Buffer.from("WEBP"));
  if (!validSignature) throw new MemberPhotoError("ไฟล์รูปไม่ถูกต้อง", 400);

  const uploadRoot = path.join(process.cwd(), "public", "uploads", "members");
  const filename = `${randomBytes(32).toString("hex")}.${extension}`;
  const url = `/uploads/members/${filename}`;
  let newPath: string | undefined;
  let oldUrl: string | null = null;
  try {
    await runAuditedMutation(
      { actorStaffId: actor.staffId, branchId, action: "MEMBER_PHOTO_UPDATED", entityType: "MEMBER", entityId: memberId, metadata: { fields: ["photo"] } },
      async (tx) => {
        const [member] = await tx.select({ id: members.id, homeBranchId: members.homeBranchId, status: members.status, photoUrl: members.photoUrl })
          .from(members).where(and(eq(members.id, memberId), eq(members.homeBranchId, branchId))).limit(1).for("update");
        if (!member || member.homeBranchId !== branchId || member.status === "CANCELLED")
          throw new MemberPhotoError("ไม่พบสมาชิกที่อัปโหลดรูปได้", 404);
        const snapshot = await getMemberConsentSnapshot(memberId, undefined, tx);
        if (!snapshot.current.PHOTO)
          throw new MemberPhotoError("ต้องได้รับความยินยอมใช้รูปถ่ายก่อน", 403);
        oldUrl = member.photoUrl;
        await mkdir(uploadRoot, { recursive: true });
        newPath = path.join(uploadRoot, filename);
        try {
          // ไม่เขียนทับไฟล์เดิม แม้ token สุ่มจะชนกัน และยังชดเชย partial write ที่ล้มได้
          await writeFile(newPath, buffer, { flag: "wx" });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") newPath = undefined;
          throw error;
        }
        const result = await tx.update(members).set({ photoUrl: url })
          .where(and(eq(members.id, memberId), eq(members.homeBranchId, branchId)));
        if (result[0].affectedRows !== 1)
          throw new MemberPhotoError("ไม่พบสมาชิกที่อัปโหลดรูปได้", 404);
      },
    );
  } catch (error) {
    if (newPath) await cleanupPhoto(newPath);
    throw error;
  }
  // ลบรูปเก่าหลัง commit เท่านั้น และยอมรับเฉพาะชื่อไฟล์เดี่ยวใต้ directory ของรูปสมาชิก
  if (oldUrl && /^\/uploads\/members\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(oldUrl))
    await cleanupPhoto(path.join(uploadRoot, path.basename(oldUrl)));
  return { url };
}
