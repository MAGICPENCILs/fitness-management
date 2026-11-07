# Member Photo Upload Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปิด arbitrary/path-traversal upload และทำให้รูปสมาชิก, DB URL และ Audit ใช้ workflow เดียวที่ชดเชยความล้มเหลวได้

**Architecture:** Route ตรวจ Origin/auth และแปลง multipart ขั้นต้น จากนั้นเรียก service ที่ validate MIME/signature/size, ล็อกสมาชิกในสาขา, ตรวจ PHOTO consent, เขียนไฟล์ชื่อสุ่มและอัปเดต DB/Audit ผ่าน transaction เดิม Client ใช้ response เดียวและ PATCH สมาชิกทั่วไปไม่รับ `photoUrl`

**Tech Stack:** Next.js 16.4.4 Route Handler, TypeScript, Drizzle/MySQL, Node `crypto`/`fs`, Zod/Vitest

**Spec:** `docs/superpowers/specs/2026-11-07-member-photo-upload-hardening-design.md`

## Global Constraints

- ใช้พอร์ต `3005`
- รับ JPEG/PNG/WebP ขนาด 1 byte ถึง 5 MiB และตรวจ magic bytes
- ห้ามใช้ client filename/memberCode/path ในชื่อไฟล์
- ชื่อไฟล์เป็น random 64 hex characters และ extension จาก MIME
- ตรวจ Origin ก่อน body; ตรวจ permission, branch, status และ PHOTO consent
- DB URL + SUCCESS Audit อยู่ transaction เดียว; DB/Audit fail ต้องลบไฟล์ใหม่
- ห้าม raw error/PII/path/filename ใน response, Audit หรือ log
- Function และ business-rule comments เป็นภาษาไทย
- ไม่เพิ่ม dependency และไม่เปลี่ยน schema

## Review Focus

- multipart ที่ไม่มี/ซ้ำ/wrong-type field ต้อง fail แบบคงที่
- MIME ที่ถูกแต่ magic bytes ปลอมต้องถูกปฏิเสธ
- wrong-branch/not-found ต้องไม่เผยความต่างและไม่เขียนไฟล์
- concurrent replacement ต้อง lock row และไม่ทำให้ DB ชี้ไฟล์ที่ไม่มีอยู่
- cleanup fail ต้องไม่ rollback DB ที่ commit แล้วหรือเผย raw error

---

### Task 1: Harden member photo mutation end-to-end

**Files:**
- Create: `lib/member-photo-service.ts`
- Create: `lib/member-photo-service.test.ts`
- Create: `app/api/upload/route.test.ts`
- Modify: `app/api/upload/route.ts`
- Modify: `app/api/members/[id]/route.ts`
- Modify: `components/members/member-detail.tsx`

**Interfaces:**
- Produces: `saveMemberPhoto(input: { actor: ActorContext; branchId: number; memberId: number; file: File }): Promise<{ url: string }>`
- Consumes: `runAuditedMutation`, `getMemberConsentSnapshot`, `members`, Node filesystem and server-generated randomness

- [ ] **Step 1:** เขียน service tests ให้ RED สำหรับ size/MIME/signature, branch/status/consent, random filename, transaction update/Audit และ compensation เมื่อ mutation fail
- [ ] **Step 2:** รัน focused service tests และยืนยันว่า fail เพราะ service ยังไม่มี
- [ ] **Step 3:** Implement validation และ `saveMemberPhoto` ขั้นต่ำ พร้อมคอมเมนต์กฎธุรกิจภาษาไทย
- [ ] **Step 4:** รัน service tests ให้ GREEN
- [ ] **Step 5:** เขียน route/client contract tests ให้ RED สำหรับ Origin-before-body, memberId/file validation, fixed errors และ no second PATCH/memberCode
- [ ] **Step 6:** Implement route บาง, ตัด `photoUrl` ออกจาก generic member PATCH และปรับ client ใช้ upload response เดียว
- [ ] **Step 7:** รัน focused tests, full suite, typecheck, lint, build และ `git diff --check`
- [ ] **Step 8:** Commit `fix: harden member photo uploads`
