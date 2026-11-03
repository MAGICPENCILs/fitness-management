# Fitness Pro Integrated MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ส่งมอบ Fitness Pro แบบ testable integrated MVP โดยปิด security baseline และเพิ่มงานปฏิบัติการที่ค้างแบบปลอดภัย

**Architecture:** ต่อยอด Next.js App Router + Drizzle/MySQL monolith เดิม แยก Staff/Member sessions และใช้ config-gated adapters สำหรับ external systems แต่ละ task ต้อง deploy/test ได้เอง

**Tech Stack:** Next.js 16.3.x, React 19, TypeScript, Drizzle ORM, MySQL, Vitest, Zod, jose, Node crypto

**Spec:** `docs/superpowers/specs/2026-11-03-integrated-mvp-design.md`

## Global Constraints

- Run application on port `3005`.
- Read version-matched Next.js guides from `node_modules/next/dist/docs/` before editing framework APIs.
- Use Thai comments for functions and business rules.
- Never print credentials, tokens, password hashes, raw IPs, or database URLs.
- Provider/hardware integrations default to disabled and must support deterministic simulation.
- Do not restore the live database during automated verification.

## Review Focus

- Concurrent session/token rotation must not create reusable stale tokens.
- Cross-branch Staff/Member access must fail closed in service and route layers.
- Backup/restore commands must never expose secrets or target an unconfirmed database.
- Financial totals, VAT, discounts, salary and commissions must use deterministic rounding.
- Provider/hardware failures must not claim success or corrupt the primary transaction.

---

### Task 1: Close Current Auth and Repository Baseline

**Files:**
- Modify: `components/auth/current-staff-menu.tsx`
- Modify: `components/auth/current-staff-menu.test.tsx`
- Modify: `lib/auth/session-service.ts`
- Modify: `proxy.ts`
- Modify: `.gitignore`
- Test: existing Auth/Session/Security suites

**Interfaces:**
- Produces: clean authenticated navigation baseline and development-only diagnostic statuses

- [ ] Verify focused Logout/Session tests and run full suite/static checks.
- [ ] Ignore generated `output/` artifacts without deleting user files.
- [ ] Commit only the pending Auth baseline and repository hygiene.
- [ ] Push the four existing commits plus this baseline commit to `origin/main`.

### Task 2: Upgrade Next.js 16.3 and Refresh Project Documentation

**Files:**
- Modify: `package.json`, lockfile, version-sensitive config/code only if required
- Modify: `README.md`, `Fitness Plan.md`, `app/(protected)/settings/page.tsx`
- Test: full suite, typecheck, lint, build, port 3005 smoke QA

**Interfaces:**
- Produces: verified stable `16.3.x` runtime and accurate operator documentation

- [ ] Resolve the latest stable `16.3.x` release from the official registry and install exact matching Next/ESLint packages.
- [ ] Read installed `node_modules/next/dist/docs/` guides and apply only required migrations.
- [ ] Update stale roadmap/settings/README content without changing finished business behavior.
- [ ] Verify and commit the framework/documentation baseline.

### Task 3: Operator Backup, Verification and Restore

**Files:**
- Create: `scripts/backup-database.ts`, `scripts/restore-database.ts`, `lib/backup/*`
- Modify: `package.json`, `.env.example`, `.gitignore`, `README.md`
- Test: `lib/backup/*.test.ts`, script contract tests

**Interfaces:**
- Produces: `createBackup`, `verifyBackup`, `restoreBackup` using configured MySQL binaries and SHA-256 manifest

- [ ] Write failing tests for secret-safe commands, manifest verification and restore confirmation.
- [ ] Implement dump/verify/restore orchestration with explicit database confirmation and disabled-by-default restore.
- [ ] Test with fakes/temp files only; document real operator procedure.
- [ ] Verify and commit.

### Task 4: Printable Receipt and Tax Invoice

**Files:**
- Create: receipt settings schema/migration, receipt service, print page and API
- Modify: payments UI, settings navigation and audit policy
- Test: financial rounding, access control and render content tests

**Interfaces:**
- Produces: immutable receipt snapshot, VAT calculation and print/PDF-friendly document route

- [ ] Write RED financial snapshot and authorization tests.
- [ ] Add branch tax settings and immutable receipt snapshot migration.
- [ ] Implement receipt/tax invoice page, print action and audit.
- [ ] Verify sample output in browser, then commit.

### Task 5: Notification Delivery Adapters

**Files:**
- Create: `lib/notifications/providers/*`
- Modify: `lib/notification-engine.ts`, notification routes/settings, `.env.example`
- Test: provider adapter and retry/state tests

**Interfaces:**
- Produces: `deliverNotification(notification)` with IN_APP, SMTP, LINE and generic SMS webhook adapters

- [ ] Write RED tests for disabled, success, retryable and permanent failure states.
- [ ] Implement config-gated adapters without logging recipients or credentials.
- [ ] Add admin retry/status UI and audit.
- [ ] Verify simulator mode and commit.

### Task 6: Hardware Adapter and Access Kiosk

**Files:**
- Create: hardware adapter service/config and kiosk UI
- Modify: scan service/route and security documentation
- Test: simulator, timeout and fail-closed tests

**Interfaces:**
- Produces: `readCredential`, `requestDoorOpen` adapters with simulator and webhook modes

- [ ] Write RED tests for approved/rejected scans and unavailable door controller.
- [ ] Move scan rules into a testable service and invoke hardware only after committed approval.
- [ ] Add kiosk simulator and health status; never claim a door opened on adapter failure.
- [ ] Verify and commit.

### Task 7: Freeze Ledger and Dynamic QR

**Files:**
- Create: freeze/token schemas and migration, services, routes and member UI
- Modify: scan validation and member package views
- Test: date arithmetic, yearly limit, token expiry/revoke/concurrency

**Interfaces:**
- Produces: freeze/unfreeze lifecycle and short-lived hashed access tokens

- [ ] Write RED policy and race-condition tests.
- [ ] Implement audited freeze/unfreeze transactions and expiry extension.
- [ ] Implement QR issue/rotate/revoke and scan validation while retaining static-card compatibility.
- [ ] Verify and commit.

### Task 8: Online Signup and Member Portal

**Files:**
- Create: member applications/accounts/sessions schema and migration
- Create: public signup, member login and portal routes/components
- Test: consent, enumeration resistance, session isolation and approval tests

**Interfaces:**
- Produces: pending member application flow and responsive member self-service portal

- [ ] Write RED public boundary and Member-session isolation tests.
- [ ] Implement pending applications with Staff approval and no automatic facility access.
- [ ] Implement Member login/session, package, visits, bookings and dynamic QR views.
- [ ] Add PWA metadata/manifest and verify mobile accessibility.
- [ ] Verify and commit.

### Task 9: Staff TOTP, Attendance and Compensation

**Files:**
- Create: 2FA/attendance/compensation schemas, services, routes and admin UI
- Modify: Login flow and Staff settings
- Test: TOTP windows/replay, branch scope, commission rounding and payroll approval

**Interfaces:**
- Produces: optional Staff TOTP challenge, attendance ledger and manual payroll summary

- [ ] Write RED TOTP encryption/recovery/replay tests.
- [ ] Implement enrollment/challenge/disable with recovery codes and audit.
- [ ] Implement attendance punches and correction audit.
- [ ] Implement base salary/commission rules and approved summary without statutory tax calculation.
- [ ] Verify and commit.

### Task 10: Advanced Reports and Exports

**Files:**
- Create/modify: report queries, filters, CSV endpoints and report UI
- Test: branch scope, date boundaries, totals and CSV escaping

**Interfaces:**
- Produces: member, peak-hour, promotion, VAT and workforce reports

- [ ] Write RED report/CSV contract tests.
- [ ] Implement scoped queries and print-friendly/CSV outputs.
- [ ] Add dashboard links and empty/loading/error states.
- [ ] Verify and commit.

### Task 11: Whole-System QA and Delivery

**Files:**
- Modify: docs/reports only for verified evidence

**Interfaces:**
- Consumes: all previous tasks
- Produces: clean `main`, migration/runbook evidence and GitHub delivery

- [ ] Apply migrations to the approved local database and verify aggregate postconditions without PII.
- [ ] Run full tests, typecheck, lint and production build.
- [ ] Run browser QA on port 3005 for roles, themes, mobile, keyboard and destructive actions in test data only.
- [ ] Record limitations for external Provider/Hardware credentials and physical calibration.
- [ ] Merge/push final work to `origin/main` and confirm clean repository state.

