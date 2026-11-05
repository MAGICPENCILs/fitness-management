# Database Readiness and Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สำรองและ migrate ฐานข้อมูลจริงอย่างกู้คืนได้ พร้อมทำให้ Login/health รายงาน schema drift อย่างปลอดภัย

**Architecture:** ใช้ backup/restore และ Drizzle journal ที่มีอยู่เป็น source of truth. เพิ่ม readiness service กลางที่ Login และ public health route เรียกใช้ โดยไม่เปลี่ยน auth repository.

**Tech Stack:** Next.js 16.4.4, TypeScript, Drizzle ORM, MySQL 8, Vitest

**Spec:** `docs/superpowers/specs/2026-11-05-database-readiness-design.md`

## Global Constraints

- ห้าม migrate ก่อน encrypted backup และ dry-run verification ผ่าน
- ห้ามพิมพ์ secret, DATABASE_URL, SQL error หรือชื่อฐานข้อมูลใน client/log
- ใช้ TDD สำหรับ readiness behavior และคอมเมนต์กฎธุรกิจเป็นภาษาไทย
- ไม่มี dependency runtime ใหม่

## Review Focus

- migration journal ไม่มีตาราง → Login ต้องคืน `SCHEMA_NOT_READY` ไม่ใช่ generic 500
- journal เก่ากว่า required → health 503 และไม่เรียก auth service
- database ติดต่อไม่ได้ → health 503 แบบ `unavailable` โดยไม่เปิดเผยรายละเอียด
- schema พร้อม → Login/credential/rate-limit flow เดิมต้องไม่เปลี่ยน
- migration สำเร็จบางส่วน → journal/table verification ต้องจับได้ก่อนประกาศเสร็จ

---

### Task 1: Encrypted pre-migration backup

**Files:**
- Runtime artifact: `backups/*.sql.enc`
- Runtime artifact: `backups/*.manifest.json`
- Modify ignored config: `.env`

**Interfaces:**
- Consumes: `npm run db:backup`, `npm run db:restore`
- Produces: backup + manifest ที่ dry-run verify ผ่าน

- [ ] **Step 1:** ตรวจ `DATABASE_URL`, binary paths และ key presence โดยไม่พิมพ์ค่า
- [ ] **Step 2:** สร้าง `BACKUP_ENCRYPTION_KEY` 32 bytes ลง `.env` เฉพาะเมื่อไม่มี
- [ ] **Step 3:** รัน backup ด้วย `MYSQLDUMP_BINARY` ที่พบและ schema version ปัจจุบัน `0010_auth_sessions`
- [ ] **Step 4:** รัน restore CLI แบบ dry-run กับ artifact ล่าสุดและตรวจ exit 0

### Task 2: Database migration and verification

**Files:**
- Apply: `drizzle/0011_add_receipt_documents.sql` through `drizzle/0016_add_staff_workforce.sql`

**Interfaces:**
- Consumes: verified backup from Task 1
- Produces: database journal through `0016_add_staff_workforce`

- [ ] **Step 1:** รัน `npm exec drizzle-kit migrate`
- [ ] **Step 2:** query migration journal และ expected tables แบบ read-only
- [ ] **Step 3:** query Login join เพื่อยืนยันว่า `staff_totp` พร้อม

### Task 3: Schema readiness service and health route

**Files:**
- Create: `lib/system-readiness.ts`
- Create: `lib/system-readiness.test.ts`
- Create: `app/api/health/route.ts`
- Create: `app/api/health/route.test.ts`

**Interfaces:**
- Produces: `getSystemReadiness()`, `assertSchemaReady()`, `SchemaNotReadyError`

- [ ] **Step 1:** เขียน tests สำหรับ READY, OUTDATED, missing journal และ UNAVAILABLE แล้วรันให้ fail
- [ ] **Step 2:** implement service ขั้นต่ำจาก journal timestamp และ repository injection
- [ ] **Step 3:** รัน service tests ให้ผ่าน
- [ ] **Step 4:** เขียน health route tests สำหรับ 200/503 และ secret-safe payload แล้วรันให้ fail
- [ ] **Step 5:** implement health route และรัน tests ให้ผ่าน

### Task 4: Login readiness gate

**Files:**
- Modify: `app/api/auth/login/route.ts`
- Modify/Test: auth route tests ที่มีอยู่
- Modify: `components/auth/login-form.tsx`
- Modify/Test: Login form tests ที่มีอยู่

**Interfaces:**
- Consumes: `assertSchemaReady()` and `SchemaNotReadyError`
- Produces: HTTP 503 `{ code: "SCHEMA_NOT_READY", error: string }`

- [ ] **Step 1:** เพิ่ม route/form tests ให้ fail และยืนยันว่า auth service ไม่ถูกเรียก
- [ ] **Step 2:** wire readiness หลัง origin/payload validation และ map stable response
- [ ] **Step 3:** แสดงข้อความ schema โดยไม่ต่อท้ายคำแนะนำตรวจ credential
- [ ] **Step 4:** รัน focused tests ให้ผ่าน

### Task 5: End-to-end verification and delivery

**Files:**
- Modify: `README.md`
- Modify: `docs/qa/2026-11-03-integrated-mvp.md`

- [ ] **Step 1:** รัน focused Login/health tests, full tests, typecheck, lint, Drizzle check และ production build
- [ ] **Step 2:** ทดสอบ `/api/health` และ Login บน port 3005
- [ ] **Step 3:** review diff/security, commit, push `main`, และยืนยัน local/remote SHA ตรงกัน

