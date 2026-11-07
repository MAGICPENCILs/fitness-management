# Photo Storage Privacy Design

## เป้าหมาย

ปิดการอ่านรูปสมาชิกและไฟล์พักลบผ่าน URL สาธารณะ โดยยังอ่านรูปเดิมได้ผ่านสิทธิ์พนักงาน และย้ายไฟล์ใหม่ไป persistent storage นอก `public` โดยไม่ทำข้อมูลหรือไฟล์สูญหาย

## ขอบเขตที่ต้องเปลี่ยนพร้อมกัน

- Route อ่านรูปต้องตรวจ authoritative staff session, สมาชิกปัจจุบัน, PHOTO consent และสิทธิ์ `members.manage` หรือ `access.manage` ตาม `member.homeBranchId` ก่อนอ่านไฟล์
- UI สมาชิกและเครื่องสแกนใช้ gateway ตาม member ID เท่านั้น ห้ามนำ `photoUrl` ดิบไปเป็น `src`
- `/uploads/members/*` และ `/uploads/privacy-cleanup/*` ต้องตอบ 404 แบบคงที่ก่อนอ่าน cookie สำหรับทุก role และทุกนามสกุล รวมถึงปิดทางผ่าน `/_next/image`
- รูปใหม่และ quarantine ใหม่อยู่ใต้ `storage/` นอก `public`; เพิ่ม `storage/` ใน `.gitignore`
- รองรับ reference เดิมทั้ง `/uploads/members/<safe-name.ext>` และ `/member-photos/<64hex>.<jpg|png|webp>` โดยอ่าน private-first และ fallback ไป public เดิมเฉพาะ `ENOENT`
- cleanup token เดิมต้องลบทั้ง private และ public quarantine; error ที่ไม่ใช่ `ENOENT` ห้ามถูกนับว่าสำเร็จ
- withdrawal/anonymization ต้องหยุดด้วย 409 ก่อน mutation หากไฟล์เดียวกันยังถูกสมาชิกอื่นอ้างถึง หรือพบไฟล์ชนกันหลาย root; ห้ามคัดลอกแล้วลบเมื่อ `rename` ข้าม filesystem ล้มเหลว
- คง member lock, audit transaction, commit-ack verification และ rollback/restore behavior ที่มีอยู่

## สัญญา HTTP

- Gateway หลัก: `GET /member-photos/by-member/<positive-safe-integer>`
- สำเร็จ: bytes พร้อม `Content-Type`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`
- ไม่พบ/ไม่มี session/session ใช้ไม่ได้/ไม่มีสิทธิ์/ต่างสาขา/ไม่มี consent/สมาชิก CANCELLED/reference หรือไฟล์ใช้ไม่ได้: ตอบ 404 body เดียวกัน `{ "error": "ไม่พบรูปสมาชิก" }` และ headers ความเป็นส่วนตัวเดียวกัน โดยไม่มี redirect หรือรายละเอียด session/path
- internal I/O failure ตอบข้อความคงที่โดยไม่เผย path/SQL/PII
- Member Portal ไม่ได้รับสิทธิ์เพิ่มในรอบนี้

## Storage contract

- รูปใหม่: `<cwd>/storage/member-photos/<64hex>.<ext>`
- quarantine ใหม่: `<cwd>/storage/privacy-cleanup/<64hex>`
- compatibility read/cleanup: `<cwd>/public/uploads/members` และ `<cwd>/public/uploads/privacy-cleanup`
- ถ้า candidate มากกว่าหนึ่งตำแหน่งมีไฟล์จริง ให้ fail closed เพื่อรอ manual reconciliation
- Deployment ต้อง mount/backup DB, `storage/`, และ legacy public directories เป็นชุดเดียวกันจนกว่าจะ migrate และตรวจสอบครบ

## การอนุญาต

อ่านรูปได้เมื่อทุกข้อจริง:

1. `requireFullSession()` ผ่านและสร้าง `ActorContext` ได้
2. member ID อ้างถึงสมาชิกที่ยังไม่ `CANCELLED` และมี `photoUrl` ที่ผ่าน allowlist
3. latest PHOTO consent เป็น GRANTED
4. actor มี `members.manage` หรือ `access.manage` สำหรับ `member.homeBranchId`

Owner อ่านข้ามสาขาได้ตาม RBAC เดิม; Manager/Counter อ่านเฉพาะสาขาตน; Trainer และ member cookie ถูกปฏิเสธ

## เกณฑ์ผ่าน

- Tests พิสูจน์ session/RBAC/branch/consent/status/reference/header/error contract ของ gateway
- Tests พิสูจน์ไฟล์ใหม่เขียนนอก `public`, legacy fallback ทำงาน และ ambiguous copies fail closed
- Tests พิสูจน์ raw paths และ optimizer ถูกปิดทั้ง path ที่มี/ไม่มี extension
- Tests พิสูจน์ member detail และ scan UI ใช้ member-ID gateway และล้าง preview หลัง consent withdrawal
- Tests พิสูจน์ dual-root cleanup, shared-reference 409 และ rollback/race เดิมไม่ถอยหลัง
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npx drizzle-kit generate`, `npm run build` ผ่าน
- Production smoke บน port 3005 ใช้ fixture ที่มีอยู่ก่อน start และยืนยัน raw paths ไม่คืน bytes; จากนั้นคืน dev server ที่ port 3005

## ไม่ทำในรอบนี้

- ไม่เพิ่ม dependency หรือ storage provider abstraction
- ไม่เปิดรูปให้ Member Portal
- ไม่ทำ automatic data migration หรือเดา consent ให้ข้อมูล legacy
- ไม่แก้ schema
