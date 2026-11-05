# Database Readiness and Migration Safety Design

## Intent

แก้เหตุ Login ล้มเหลวหลัง deploy โค้ดใหม่ก่อน migration โดยสำรองฐานข้อมูลจริงให้กู้คืนได้, migrate จาก `0010` ถึง `0016`, และทำให้ระบบรายงาน schema ที่ล้าสมัยอย่างปลอดภัยแทน generic authentication error

## Goals

- สร้าง backup เข้ารหัสและ verify checksum/AES-GCM ก่อน DDL ทุกครั้ง
- migrate ด้วย Drizzle journal เดิม แล้วตรวจ journal และตารางที่ Login ต้องใช้
- เพิ่ม public readiness endpoint ที่ไม่เปิดเผย URL, credential, SQL หรือชื่อฐานข้อมูล
- ให้ Login คืน `503` พร้อม stable code `SCHEMA_NOT_READY` ก่อนแตะ auth/rate-limit/audit เมื่อ schema ล้าสมัย
- คงพฤติกรรม credential, rate-limit และ session เดิมเมื่อ schema พร้อม

## Non-goals

- ไม่ทำ automatic migration ตอนเริ่ม server
- ไม่สร้างหน้า Admin ใหม่ เพราะ Admin Login ไม่ได้เมื่อ schema ขาด
- ไม่เปลี่ยน authentication repository หรือทำให้ TOTP เป็น optional join
- ไม่ทดสอบ provider/hardware/payroll จริงในรอบนี้

## Constraints

- ใช้ Next.js `16.4.4`, Drizzle และโค้ดเดิมเท่านั้น ไม่มี dependency runtime ใหม่
- คอมเมนต์ฟังก์ชันและกฎธุรกิจเป็นภาษาไทย
- MySQL DDL auto-commit จึงห้าม migrate ก่อน backup และ dry-run verify ผ่าน
- Secret ใหม่เก็บเฉพาะ `.env` ที่ ignore โดยไม่พิมพ์ค่าลง log

## Approaches

1. **Migrate อย่างเดียว** — แก้เหตุปัจจุบันเร็ว แต่ deploy ผิดลำดับครั้งหน้าจะกลับมาเป็น generic 500
2. **ทำ join TOTP แบบมีเงื่อนไข** — ซ่อน schema drift และทำให้โค้ดรองรับฐานข้อมูลหลายรุ่นโดยไม่จำเป็น
3. **Migrate พร้อม readiness gate (เลือก)** — ใช้ migration journal เป็น source of truth, fail-fast ก่อน auth query และมี health endpoint สำหรับ monitor โดยแตะโค้ดน้อยที่สุด

## Design

`lib/system-readiness.ts` อ่าน migration ล่าสุดที่ต้องการจาก journal และ query เฉพาะ `MAX(created_at)` จาก `__drizzle_migrations`. Service แปลงผลเป็น `READY`, `OUTDATED`, หรือ `UNAVAILABLE`; `SchemaNotReadyError` ไม่พก SQL/credential. Login ตรวจ readiness หลัง validation/origin และก่อน auth service. `/api/health` เปิดเผยเพียงสถานะ database/schema กับ required migration tag เมื่อ outdated.

Operational flow คือสร้าง `BACKUP_ENCRYPTION_KEY` แบบสุ่ม 32 bytes ลง `.env` หากยังไม่มี, ใช้ MySQL Workbench binaries เฉพาะ process, สร้าง backup, dry-run verify, migrate, ตรวจ journal/tables แล้วจึงทดสอบ Login และชุด verification.

