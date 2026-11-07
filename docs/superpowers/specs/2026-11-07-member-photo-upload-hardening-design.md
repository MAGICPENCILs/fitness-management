# Member Photo Upload Hardening Design

วันที่: 2026-11-07
สถานะ: อนุมัติให้ดำเนินการจากคำสั่งเดิมที่ให้ปิดงานทั้งหมดโดยไม่ถามซ้ำ

## เป้าหมาย

ทำให้การเปลี่ยนรูปสมาชิกเป็น mutation เดียวที่ตรวจ Origin, สิทธิ์, สาขา, PHOTO consent, ชนิดและขนาดไฟล์ก่อนเขียน URL กับ Audit พร้อมชดเชยไฟล์ใหม่เมื่อ transaction ล้ม โดยไม่รับ path หรือชื่อไฟล์จาก client

## ขอบเขตและกฎ

- Client ส่งเฉพาะ `memberId` และ `file` ไป `POST /api/upload`
- ตรวจ trusted Origin ก่อนอ่าน body และบังคับ `members.manage` ในสาขาปัจจุบัน
- `memberId` ต้องเป็น positive safe integer และสมาชิกต้องอยู่สาขาปัจจุบัน ไม่เป็น `CANCELLED`
- PHOTO consent ล่าสุดต้องเป็น `GRANTED`
- รับเฉพาะ JPEG, PNG และ WebP ขนาด 1 byte ถึง 5 MiB
- ตรวจทั้ง MIME และ magic bytes; ไม่เชื่อ `file.name` หรือนามสกุลจาก client
- ชื่อไฟล์เป็น random server token 64 hex characters และ extension จาก MIME
- อัปเดต `members.photoUrl` พร้อม SUCCESS Audit `MEMBER_PHOTO_UPDATED` / `MEMBER` ใน transaction เดียว
- ถ้า DB/Audit ล้ม ให้ลบไฟล์ใหม่; หลัง commit ให้ลบรูปเดิมแบบ path-safe และไม่ส่ง raw error เข้า log
- PATCH สมาชิกทั่วไปต้องไม่รับ `photoUrl` อีก เพื่อปิดทางอ้อมที่ข้าม upload boundary
- Client แสดงรูปใหม่เฉพาะเมื่อ upload สำเร็จ และแสดง error ที่เข้าถึงได้เมื่อไม่สำเร็จ

## แนวทางที่พิจารณา

1. **แก้ route เดิมอย่างเดียว** — diff สั้น แต่ validation/filesystem/transaction coupling ทดสอบยากและ PATCH ยังเป็น bypass
2. **เพิ่ม service เล็กสำหรับ photo mutation + route บาง (เลือก)** — รวมกฎและ compensation ไว้จุดเดียว ทดสอบ RED/GREEN ได้โดยไม่เพิ่ม dependency
3. **ย้ายไป object storage โดยตรง** — แก้ persistence/scale ระยะยาว แต่ต้องใช้ provider credential, signed upload และ lifecycle policy ซึ่งยังไม่มี

## Error และความเป็นส่วนตัว

Response ใช้ข้อความคงที่ ไม่เปิดเผยว่าสมาชิกอยู่สาขาใด, path ภายใน, SQL หรือสาเหตุ filesystem. Audit เก็บเพียง member entity id และ field `photo`; filename, original name, MIME detail และ PII ไม่เข้า Audit

## ข้อจำกัดที่ยอมรับชั่วคราว

Filesystem กับ MySQL ไม่ใช่ transaction เดียวกัน จึงใช้ compensation: ไฟล์ใหม่ถูกลบเมื่อ transaction ล้ม และรูปเก่าถูกลบหลัง commit. หาก cleanup รูปเก่าล้ม จะ log เฉพาะรหัสคงที่และต้องให้ storage reconciliation จัดการภายหลัง. Reverse proxy production ต้องจำกัด request body เพราะ `Request.formData()` อาจ parse multipart ก่อนตรวจ `file.size` เมื่อ request ไม่มี `Content-Length`.

## เกณฑ์สำเร็จ

- Tests เห็น RED สำหรับ untrusted Origin, invalid member id, wrong branch/cancelled/no consent, spoofed image, oversize และ DB failure cleanup
- Valid JPEG/PNG/WebP บันทึก random path, DB URL และ Audit ครั้งเดียว
- Client ไม่ส่ง member code และไม่ยิง PATCH รูปครั้งที่สอง
- ไม่มี raw error logging, traversal หรือ arbitrary public file write
- Full tests, typecheck, lint, build และ independent security review ผ่าน
