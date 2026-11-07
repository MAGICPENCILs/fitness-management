import "server-only";

import { randomBytes } from "crypto";
import { mkdir, writeFile, unlink, stat } from "fs/promises";
import path from "path";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { members } from "@/db/schema";
import { runAuditedMutation } from "@/lib/audit-service";
import { getMemberConsentSnapshot } from "@/lib/privacy-service";
import { hasPermission, type ActorContext } from "@/lib/rbac";
import { memberPhotoAliases, resolveMemberPhotoPaths } from "@/lib/member-photo-path";

export class MemberPhotoError extends Error {
  /** คืนเฉพาะข้อความคงที่และสถานะ HTTP โดยไม่เปิดเผยข้อมูลสมาชิกหรือ filesystem */
  constructor(message: string, public status: number) {
    super(message);
    this.name = "MemberPhotoError";
  }
}

/** ลบเมื่อ primary DB ยืนยันว่าไม่มี reference และมี source เดียว; สำเนาซ้ำ/ตรวจไม่ได้ต้องเก็บรอ reconciliation */
async function cleanupPhoto(photoUrl: string, filePaths: string[]) {
  try {
    const [reference] = await db.select({ id: members.id }).from(members)
      .where(inArray(members.photoUrl, memberPhotoAliases(photoUrl))).limit(1);
    if (reference) return;
    if (filePaths.length > 1) {
      const existing: string[] = [];
      for (const filePath of filePaths) {
        try { await stat(filePath); existing.push(filePath); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
      if (existing.length > 1) {
        console.error("MEMBER_PHOTO_CLEANUP_AMBIGUOUS");
        return;
      }
      filePaths = existing;
    }
    for (const filePath of filePaths) {
      try { await unlink(filePath); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("MEMBER_PHOTO_CLEANUP_FAILED");
  }
}

/** ตรวจชนิดและ consent ภายใต้ member lock ก่อนเขียน private storage กับ Audit และชดเชยเฉพาะ rollback ที่ยืนยันได้ */
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

  const uploadRoot = path.join(process.cwd(), "storage", "member-photos");
  const filename = `${randomBytes(32).toString("hex")}.${extension}`;
  const url = `/member-photos/${filename}`;
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
    if (newPath) await cleanupPhoto(url, [newPath]);
    throw error;
  }
  // ลบทั้ง private และ legacy หลัง commit เฉพาะเมื่อไม่มีสมาชิกอ้างผ่าน alias ใดแล้ว
  const oldPaths = oldUrl ? resolveMemberPhotoPaths(oldUrl) : null;
  if (oldUrl && oldPaths) await cleanupPhoto(oldUrl, oldPaths);
  return { url };
}
