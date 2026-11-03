# Fitness Pro

ระบบบริหารฟิตเนสแบบหลายสาขา ครอบคลุมสมาชิก แพ็กเกจ การชำระเงิน การเข้าใช้บริการ อุปกรณ์ คลาส PT บัญชี CRM/loyalty, PDPA, บัญชีพนักงาน RBAC และ Audit log

## เทคโนโลยี

- Next.js 16.3.8 (App Router + Turbopack), React 19 และ TypeScript
- Tailwind CSS 4 และ Radix UI
- MySQL, Drizzle ORM และ Argon2
- Session cookie ที่ลงลายเซ็น, rate limit และ RBAC ฝั่ง server

## เริ่มใช้งานสำหรับ Development

ต้องใช้ Node.js 20.9 ขึ้นไปและ MySQL ที่เข้าถึงได้ จากนั้นคัดลอก `.env.example` เป็น `.env` และแทน placeholder ด้วยค่าของ environment นั้น

```powershell
npm install
npm run dev
```

เปิด [http://localhost:3005](http://localhost:3005) พอร์ต development และ production ของโปรเจกต์คือ `3005`

## Environment สำคัญ

- `DATABASE_URL` ต้องชี้ฐานข้อมูล MySQL เป้าหมายที่ตรวจสอบแล้ว
- `APP_ORIGIN` ต้องตรงกับ origin ที่ผู้ใช้เปิดจริง
- `AUTH_SESSION_SECRET` และ `AUTH_FINGERPRINT_SECRET` ต้องเป็นค่าสุ่มคนละค่าและยาวอย่างน้อย 32 bytes
- `AUTH_TOTP_ENCRYPTION_KEY` ต้องเป็น base64 ของ key สุ่ม 32 bytes และต้องเก็บใน secret manager เพื่อถอด TOTP secret ของพนักงาน
- ใช้ `TRUST_PROXY=true` เฉพาะเมื่อ deploy หลัง reverse proxy ที่เชื่อถือได้
- `ENABLE_DEV_STAFF_SWITCHER` ต้องเป็น `false` นอก development ที่ตั้งใจเปิดใช้

ห้าม commit `.env`, รหัสผ่าน, token, dump ฐานข้อมูล หรือไฟล์ที่มีข้อมูลส่วนบุคคล

พนักงานเปิด Authenticator 2FA และบันทึก recovery codes ได้จากเมนูบัญชีใน sidebar ส่วนหน้า Workforce ให้ผู้มีสิทธิ์จัดการเวลา เงินเดือนฐาน commission และอนุมัติ payroll แบบ manual โดยยอด payroll ยังไม่รวมภาษีและประกันสังคม

## Database และ Owner เริ่มต้น

ยืนยันฐานข้อมูลเป้าหมายก่อน apply migration:

```powershell
npx drizzle-kit migrate
```

Bootstrap `OWNER001` จาก secure shell เท่านั้น โดยส่ง `BOOTSTRAP_OWNER_PASSWORD` ให้ process ชั่วคราวแล้วล้างค่าหลังจบ:

```powershell
npm run auth:bootstrap-owner
```

คำสั่งจะปฏิเสธรหัสผ่านที่อ่อนและไม่พิมพ์รหัสผ่านหรือ hash ลง log

## Backup และ Restore สำหรับผู้ดูแลระบบ

ติดตั้ง MySQL client ที่มี `mysqldump` และ `mysql` จากนั้นกำหนด `BACKUP_ENCRYPTION_KEY` เป็น base64 ของ key สุ่ม 32 bytes ซึ่งเก็บใน secret manager แยกจากไฟล์ backup ห้าม commit หรือส่ง key คู่กับ backup

สร้าง dump ที่เข้ารหัส AES-256-GCM พร้อม SHA-256 manifest:

```powershell
npm run db:backup
```

ระบบเขียนไฟล์ลง `BACKUP_DIRECTORY` (ค่าเริ่มต้น `backups`) ให้คัดลอกทั้ง `.sql.enc` และ `.manifest.json` ไปยังพื้นที่ offsite ที่จำกัดสิทธิ์

ตรวจ checksum, manifest และถอดรหัสแบบ dry-run โดยไม่แตะฐานข้อมูล:

```powershell
npm run db:restore -- --backup "backups/<file>.sql.enc" --manifest "backups/<file>.sql.enc.manifest.json"
```

Restore จริงทำได้เฉพาะฐานข้อมูลชื่อเดียวกับ manifest และต้องเปิด flag ชั่วคราวพร้อมพิมพ์คำยืนยันตรงตัว:

```powershell
try {
  $env:BACKUP_RESTORE_ENABLED = "true"
  npm run db:restore -- --backup "backups/<file>.sql.enc" --manifest "backups/<file>.sql.enc.manifest.json" --execute --confirm "RESTORE <database>"
} finally {
  Remove-Item Env:BACKUP_RESTORE_ENABLED -ErrorAction SilentlyContinue
}
```

ควรทดสอบ restore กับฐานข้อมูลที่แยกจาก production ตาม runbook ก่อนใช้ในเหตุฉุกเฉิน และเก็บ key/dump ตามนโยบาย PDPA ขององค์กร

## Notification Providers

ระบบปิดการส่งออกภายนอกเป็นค่าเริ่มต้น (`NOTIFICATION_PROVIDER_MODE=disabled`) ใช้ `simulate` เพื่อทดสอบ state โดยไม่ส่งข้อมูลจริง และใช้ `live` เฉพาะเมื่อกำหนด secret ผ่าน environment/secret manager ครบแล้ว

- SMS ใช้ HTTPS webhook และ bearer token
- LINE OA ใช้ Channel access token กับ Push Message API
- อีเมลรองรับ SMTP implicit TLS เท่านั้น (`NOTIFICATION_SMTP_SECURE=true`) เพื่อไม่ส่ง credential ผ่าน connection ที่ไม่เข้ารหัส
- ผู้ดูแลตรวจสถานะ ส่งคิว และ retry เฉพาะ error ที่แก้ได้จากหน้า “ตั้งค่า → การแจ้งเตือน” โดยหน้าเว็บจะไม่แสดง URL, token, username หรือ password

ก่อนเปิด `live` ให้ทดสอบด้วยบัญชี sandbox ของ provider และตรวจ consent การตลาดของสมาชิก ห้ามใส่ secret ลง Git หรือ log

## Access Hardware

`ACCESS_HARDWARE_MODE` มีค่า `disabled` (ค่าเริ่มต้น), `simulate` และ `webhook` เมื่อใช้ webhook ต้องเป็น HTTPS และกำหนด token ผ่าน secret manager ระบบจะ commit ผลตรวจสิทธิ์กับ access log ก่อนขอเปิดประตู และจะแสดง “ประตูยังไม่เปิด” หาก controller ไม่ตอบหรือไม่ยืนยัน `opened=true` ห้ามใช้ simulator กับประตูจริง

## ตรวจคุณภาพก่อนส่งงาน

```powershell
npm test -- --maxWorkers=1 --pool=forks
npx tsc --noEmit
npm run lint
npm run build
```

สถานะและขอบเขตงานถัดไปอยู่ใน [Fitness Plan.md](./Fitness%20Plan.md) ส่วนแผนส่งมอบ Integrated MVP อยู่ใน `docs/superpowers/plans/`
