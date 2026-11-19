# Access Policy Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้การสแกนเลือกสิทธิ์ที่เริ่มใช้งานแล้ว รองรับ Grace Period 3–7 วัน และจำกัดแพ็กเกจรายวันหนึ่งครั้งต่อวัน

**Architecture:** คง `processCardScan` เป็น transaction boundary และใช้ member row lock เดิมเพื่อ serialize การสแกนสมาชิกคนเดียวกัน เพิ่ม singleton `access_settings` สำหรับ grace days และให้ policy function คำนวณผลแบบ pure ก่อนเขียน access log

**Tech Stack:** Next.js 16.4.6, TypeScript, Drizzle ORM/MySQL, React, Vitest

**Spec:** `Fitness Plan.md` บรรทัด 21 และ 46–80

## Global Constraints

- Grace Period ค่าเริ่มต้น 3 วัน และรับเฉพาะ 3–7 วัน
- DAILY อนุมัติได้หนึ่งครั้งต่อวันตามเขตเวลา Asia/Bangkok
- ทุกผลต้องบันทึก access log และห้ามเปิดประตูเมื่อ transaction ล้มเหลว
- ใช้ RBAC `settings.manage`, trusted origin และ audit pattern เดิม
- ฟังก์ชันและกฎธุรกิจใหม่ต้องมีคอมเมนต์ภาษาไทย
- ไม่เพิ่ม dependency

## Review Focus

- แพ็กเกจต่ออายุอนาคตต้องไม่บังแพ็กเกจปัจจุบัน
- วันสุดท้ายและวันสุดท้ายของ grace ต้องอนุมัติ แต่วันถัดไปต้องปฏิเสธ
- DAILY scan ซ้ำในวันไทยเดียวกันต้องปฏิเสธภายใต้ lock เดิม
- ไม่มีแถว settings ต้อง fallback เป็น 3 วันโดยไม่ fail-open
- API settings ต้องปฏิเสธค่าต่ำกว่า 3 หรือสูงกว่า 7 และผู้ไม่มีสิทธิ์

---

### Task 1: Access settings schema and repository

**Files:**
- Create: `db/schema/access-settings.ts`
- Modify: `db/schema/index.ts`
- Create: `drizzle/0020_access_settings.sql` และ Drizzle metadata
- Test: `db/schema/access-settings.test.ts`

**Interfaces:**
- Produces: singleton table `accessSettings` with `id = 1`, `graceDays` default 3

- [ ] เขียน schema test ให้ตรวจ singleton check/default/range expectation แล้วรันให้ RED
- [ ] เพิ่ม schema และ generate migration ด้วย Drizzle Kit
- [ ] รัน schema test และ `pnpm drizzle-kit check` ให้ผ่าน

### Task 2: Package selection, grace and daily-use enforcement

**Files:**
- Modify: `lib/access-policy.ts`
- Modify: `lib/access-policy.test.ts`
- Modify: `lib/access-service.ts`
- Modify: `lib/access-service.test.ts`

**Interfaces:**
- Consumes: `accessSettings.graceDays`
- Produces: `evaluateAccessPolicy({ ..., graceDays })` และ scan decision ที่ใช้แพ็กเกจซึ่ง `startDate <= today`

- [ ] เพิ่ม failing tests สำหรับ future renewal, grace boundaries และ DAILY scan ซ้ำ
- [ ] เพิ่ม pure date helpers/policy ที่ใช้ Asia/Bangkok และเลือกแพ็กเกจ date-eligible
- [ ] join package type, โหลด grace setting และเช็ค approved access log ของ DAILY ภายใต้ member lock
- [ ] รัน access tests ให้ GREEN

### Task 3: Owner/manager access settings UI and API

**Files:**
- Create: `app/api/access-settings/route.ts`
- Create: `app/api/access-settings/route.test.ts`
- Create: `components/settings/access-settings-form.tsx`
- Create: `components/settings/access-settings-form.test.tsx`
- Create: `app/(protected)/settings/access/page.tsx`
- Modify: `app/(protected)/settings/page.tsx`

**Interfaces:**
- Produces: GET/PATCH `/api/access-settings`, form value `graceDays: number`

- [ ] เพิ่ม failing API tests สำหรับ RBAC, trusted origin, range 3–7 และ audited upsert
- [ ] เพิ่ม route/page/form ด้วย patterns เดิมและ field label ที่เข้าถึงได้
- [ ] เพิ่ม UI test สำหรับบันทึกค่าและ error feedback
- [ ] รัน route/UI/protected-route inventory tests ให้ผ่าน

### Task 4: Verification and integration

**Files:**
- Modify: `Fitness Plan.md` เฉพาะสถานะที่พิสูจน์ได้

- [ ] รัน `pnpm test -- --maxWorkers=4`
- [ ] รัน `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm drizzle-kit check`
- [ ] รัน production build บน main checkout
- [ ] commit, fast-forward main, push และตรวจ GitHub Actions
