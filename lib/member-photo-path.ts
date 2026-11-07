import path from "path";

/** รับเฉพาะ reference ภายในที่เป็นชื่อไฟล์เดี่ยว โดยเรียง private ก่อน legacy เพื่ออ่าน/ลบอย่างปลอดภัย */
export function resolveMemberPhotoPaths(photoUrl: string): [string, string] | null {
  if (!/^\/uploads\/members\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(photoUrl) &&
      !/^\/member-photos\/[a-f0-9]{64}\.(jpg|png|webp)$/.test(photoUrl)) return null;
  const name = path.basename(photoUrl);
  return [
    path.join(process.cwd(), "storage", "member-photos", name),
    path.join(process.cwd(), "public", "uploads", "members", name),
  ];
}

/** URL สองรูปแบบอ้างไฟล์เดียวกัน จึงต้องตรวจ reference ทั้งคู่ก่อนย้ายหรือลบ */
export function memberPhotoAliases(photoUrl: string): string[] {
  if (!resolveMemberPhotoPaths(photoUrl)) return [];
  const name = path.basename(photoUrl);
  return [`/uploads/members/${name}`, `/member-photos/${name}`];
}
