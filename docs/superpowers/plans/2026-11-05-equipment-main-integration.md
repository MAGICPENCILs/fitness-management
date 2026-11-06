# Equipment Main Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** รวมระบบอุปกรณ์ production-ready เข้ากับ `main` ปัจจุบันและ migrate ฐานข้อมูลอย่างปลอดภัยจนพร้อมทดสอบบนพอร์ต 3005

**Architecture:** Merge `main` เข้า feature branch เพื่อรักษาประวัติ review แล้ว resolve เฉพาะ semantic conflicts จากนั้น regenerate migration `0017` จาก snapshot `0016`. ใช้ encrypted backup, aggregate-only pre/postflight และ fail-closed readiness ก่อนส่งมอบ

**Tech Stack:** Next.js 16.4.4, React 19, TypeScript, Drizzle ORM, MySQL, Vitest

**Spec:** `docs/superpowers/specs/2026-11-05-equipment-main-integration-design.md`

## Global Constraints

- ใช้โค้ดและ dependency เดิมก่อนเพิ่ม abstraction หรือ package ใหม่
- เขียนคอมเมนต์ฟังก์ชัน/กฎธุรกิจเป็นภาษาไทย โดยอธิบายเหตุผลและผลข้างเคียง
- อ่านเอกสาร Next.js ที่เกี่ยวข้องใน `node_modules/next/dist/docs/` ก่อนแก้ Route Handler หรือ Proxy
- Equipment code unique ทั้งบริษัท; Owner/Manager manage, Counter/Trainer read-only
- ห้ามพิมพ์หรือบันทึก credential, URL ฐานข้อมูล, PII, hash, token หรือ raw row
- ห้าม apply DDL ก่อน encrypted backup และ dry-run verification ผ่าน
- Dev และ production port คือ 3005

## Review Focus

- Public health/member/TOTP routes ต้องไม่หายเมื่อ resolve route policy
- Counter/Trainer อ่าน equipment ได้แต่ mutation ต้อง 403 และข้ามสาขาต้องถูกปฏิเสธ
- Duplicate code และ stale version ต้องแยก 409 โดยไม่รั่วข้อมูลและไม่มี SUCCESS Audit
- Retired equipment ต้องอ่าน history ได้แต่ไม่เป็น actionable maintenance และแก้ไข operation/maintenance ไม่ได้
- Migration `0017` ต้องไม่แตะ schema อื่น ไม่เปลี่ยน row count และ rerun ต้องไม่สร้าง partial state

---

### Task 1: Merge Current Main and Resolve Source Conflicts

**Files:**
- Modify: `lib/auth/route-policy.ts`
- Modify: `lib/auth/route-policy.test.ts`
- Modify: `scripts/bootstrap-owner.test.ts`
- Remove before regeneration: `drizzle/0011_equipment_production_ready.sql`
- Resolve from main: `drizzle/meta/0011_snapshot.json`, `drizzle/meta/_journal.json`

**Interfaces:**
- Consumes: current `main` at integration time
- Produces: clean merged branch retaining equipment source and all current auth/readiness behavior

- [ ] Record branch/base status and run `git merge main`
- [ ] Resolve route policy by preserving current main rules and setting only `/equipment` to `equipment.read`
- [ ] Preserve main bootstrap cold-start test and migration lineage through `0016`
- [ ] Delete obsolete equipment `0011` SQL before committing
- [ ] Run route-policy, protected inventory, bootstrap, RBAC and audit focused tests
- [ ] Run `git diff --check` and commit merge resolution

### Task 2: Generate and Verify Equipment Migration 0017

**Files:**
- Create: `drizzle/0017_equipment_production_ready.sql`
- Create: `drizzle/meta/0017_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Modify/Test: `db/schema/equipment-schema.test.ts`

**Interfaces:**
- Consumes: merged equipment schema and main snapshot `0016`
- Produces: non-destructive migration `0017_equipment_production_ready`

- [ ] Add/adjust a failing contract test requiring journal index 17, safe identifier lengths and the exact seven equipment operations
- [ ] Run the focused test and confirm RED because `0017` is absent
- [ ] Run `npx drizzle-kit generate --name=equipment_production_ready`
- [ ] Inspect SQL and snapshot; reject any DROP/DELETE/TRUNCATE, table recreation or unrelated schema change
- [ ] Run schema/migration tests and `npx drizzle-kit check`
- [ ] Commit generated artifacts and tests

### Task 3: Integrated Code Verification and Review

**Files:**
- Modify only when a failing regression proves an integration defect
- Create/Update: `docs/superpowers/reports/2026-11-05-equipment-main-integration-report.md`

**Interfaces:**
- Consumes: merged source and `0017`
- Produces: reviewed branch with reproducible verification evidence

- [ ] Run focused equipment, RBAC, audit, route-policy and sidebar suites
- [ ] Run full `npm test`, TypeScript, ESLint, production build, Drizzle check and `git diff --check` sequentially
- [ ] Fix only deterministic integration regressions with RED/GREEN tests
- [ ] Request independent whole-branch review and close Critical/Important findings
- [ ] Record commands, results and remaining external blockers in the report and commit

### Task 4: Database Backup, Migration and Postflight

**Files:**
- No product file changes unless a verified migration defect requires a reviewed fix
- Runtime artifacts: encrypted backup and manifest under ignored `backups/`

**Interfaces:**
- Consumes: verified `0017` and approved database environment
- Produces: live schema at `0017` with unchanged business row counts and verified backup

- [ ] Stop application writes or confirm maintenance window before preflight
- [ ] Query aggregate-only preflight: journal `0016`, row counts, duplicate codes, absent new columns/indexes and invalid invariant counts
- [ ] Create encrypted backup labeled `0016_add_staff_workforce` and pass dry-run restore verification
- [ ] Apply migration once
- [ ] Verify journal, enum, columns, defaults, indexes, row counts, versions and invariant counts
- [ ] Run migration command again only after complete success to confirm no pending migration

### Task 5: Runtime Smoke, Delivery and Cleanup

**Files:**
- Update: `Fitness Plan.md`
- Update: `README.md` only if equipment/runtime instructions changed
- Update: integration report with final runtime evidence

**Interfaces:**
- Consumes: migrated DB and verified build
- Produces: synced `main`/`origin/main`, port 3005 runtime and accurate project status

- [ ] Start dev server on 3005 and verify `/api/health`, `/login`, `/equipment` authorization boundary and no server error
- [ ] Exercise safe equipment API/browser scenarios available with current test accounts; record role/hardware scenarios that require external inputs
- [ ] Update stale project status/checklists without claiming external hardware/provider acceptance
- [ ] Merge to `main`, rerun full tests/build and push `origin/main`
- [ ] Remove only merged clean worktrees/branches; leave dev server on 3005 for user testing
