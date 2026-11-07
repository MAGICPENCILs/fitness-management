# Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม CI release gate และ runbook deploy แบบ vendor-neutral โดยไม่แตะ runtime behavior หรือ production credentials

**Architecture:** GitHub Actions เรียกคำสั่งตรวจที่มีอยู่ใน `package.json` บน Node.js 20 และไม่ต่อฐานข้อมูลจริง เอกสาร operations อธิบาย single-instance `next start` หลัง trusted reverse proxy พร้อม backup, health gate และ rollback

**Tech Stack:** GitHub Actions, Node.js 20, npm, Next.js 16.4.4, Vitest, TypeScript, ESLint, Drizzle Kit

**Spec:** `docs/superpowers/specs/2026-11-07-production-readiness-design.md`

## Global Constraints

- ใช้พอร์ต `3005`
- ห้ามใส่ secret หรือ production URL ใน repository/log
- ห้ามต่อหรือ mutate production database จาก CI
- ใช้คำสั่งและ dependency ที่มีอยู่แล้ว ไม่เพิ่ม package
- อธิบาย function/business rule เป็นภาษาไทยเมื่อมี code function ใหม่; งานนี้ไม่มี production function ใหม่

## Review Focus

- Workflow ต้องไม่มี secret และไม่เปิด write permission
- Test ต้องรัน serial ตาม release gate ที่พิสูจน์แล้ว
- Build ต้องไม่พึ่ง `.env` ของเครื่องนักพัฒนา
- Runbook ต้องบังคับ backup/dry-run ก่อน migration
- Rollback ต้องไม่แนะนำ rollback schema อัตโนมัติหลัง MySQL DDL

---

### Task 1: GitHub CI release gate

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: scripts `test`, `lint`, `build` และ local binaries `tsc`, `drizzle-kit`
- Produces: required CI job `quality` สำหรับ push `main` และ pull request

- [ ] **Step 1:** สร้าง workflow ที่ใช้ `actions/checkout@v4`, `actions/setup-node@v4` กับ Node 20 และ npm cache
- [ ] **Step 2:** เพิ่ม `npm ci`, serial Vitest, TypeScript, ESLint, Drizzle check และ Next production build เป็น step แยก
- [ ] **Step 3:** ตรวจว่า workflow มี `permissions: contents: read`, concurrency cancel และ timeout 30 นาที
- [ ] **Step 4:** รันคำสั่ง release gate ทั้งหมดใน clean checkout และ `git diff --check`
- [ ] **Step 5:** Commit `ci: add production quality gate`

### Task 2: Production deployment runbook

**Files:**
- Create: `docs/operations/production-deployment.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `/api/health`, backup/restore scripts, Drizzle migration และ `npm run start`
- Produces: ขั้นตอน pre-deploy, deploy, verify, rollback และ external blockers สำหรับ operator

- [ ] **Step 1:** เขียน runbook สำหรับ single-instance Node.js หลัง reverse proxy/TLS โดยไม่กำหนด vendor
- [ ] **Step 2:** ระบุ secret validation, encrypted backup/dry-run, migration, build/start และ health verification ตามลำดับ
- [ ] **Step 3:** ระบุ graceful shutdown 10–30 วินาที, rollback source/artifact และห้าม blind schema rollback
- [ ] **Step 4:** เพิ่มลิงก์ runbook ใน README และตรวจ `git diff --check`
- [ ] **Step 5:** ขอ independent review, แก้ Critical/Important, rerun gates และ commit
