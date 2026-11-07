import path from "path";

/** ใช้ directory เดียวกันสำหรับ URL เดิมและ runtime URL โดยยอมรับเฉพาะชื่อไฟล์เดี่ยวที่ผ่าน allowlist */
export function resolveMemberPhotoPath(photoUrl: string): string | null {
  if (!/^\/uploads\/members\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(photoUrl) &&
      !/^\/member-photos\/[a-f0-9]{64}\.(jpg|png|webp)$/.test(photoUrl)) return null;
  return path.join(process.cwd(), "public", "uploads", "members", path.basename(photoUrl));
}
