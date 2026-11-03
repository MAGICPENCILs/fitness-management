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
- ใช้ `TRUST_PROXY=true` เฉพาะเมื่อ deploy หลัง reverse proxy ที่เชื่อถือได้
- `ENABLE_DEV_STAFF_SWITCHER` ต้องเป็น `false` นอก development ที่ตั้งใจเปิดใช้

ห้าม commit `.env`, รหัสผ่าน, token, dump ฐานข้อมูล หรือไฟล์ที่มีข้อมูลส่วนบุคคล

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

## ตรวจคุณภาพก่อนส่งงาน

```powershell
npm test -- --maxWorkers=1 --pool=forks
npx tsc --noEmit
npm run lint
npm run build
```

สถานะและขอบเขตงานถัดไปอยู่ใน [Fitness Plan.md](./Fitness%20Plan.md) ส่วนแผนส่งมอบ Integrated MVP อยู่ใน `docs/superpowers/plans/`
