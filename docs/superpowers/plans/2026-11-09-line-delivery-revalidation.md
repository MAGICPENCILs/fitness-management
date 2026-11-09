# LINE Delivery-Time Revalidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ป้องกัน unsent LINE notifications หลัง privacy/link state เปลี่ยน และ terminalize anonymized unsent notifications ทุก channel โดยยังปิด outbound LINE

**Architecture:** ใช้ shared transactional cancellation helper กับ LINE-only preflight ที่ lock member→link→notification และ claim ก่อนปล่อย lock. Existing dispatcher completion ใช้ claim fencing เพิ่ม attempt count. Privacy/link mutations เรียก helper ใน transaction เดิม; anonymization terminalizes unsent rowsโดยไม่เปลี่ยน ordinary SMS/email flow

**Tech Stack:** Next.js 16.4, TypeScript, Drizzle/MySQL, Vitest, existing provider adapters

**Spec:** `docs/superpowers/specs/2026-11-09-line-delivery-revalidation-design.md`

## Global Constraints

- ไม่เพิ่ม dependency/schema/migration และไม่ทำ provider/network call จริง
- Outbound LINE generation/settings/UI/health gates ต้องยังปิด
- ไม่ hold DB lock ระหว่าง network call; lock order member→link→notification และ anonymization คง request→member prefix
- ไม่ log/return recipient, LINE ID, message, consent details, credential, provider body หรือ raw DB error
- Thai comments อธิบาย lock order, cancellation permanence และ in-flight limitation
- ใช้ TDD; port 3005 และคืน dev serverหลัง build

## Review Focus

- Commit-to-HTTP race และ late completion ต้องไม่ revive cancelled rows
- Recipient mismatch/relink ต้อง cancel ไม่ retarget
- MARKETING withdrawal ต้อง cancelเฉพาะ LINE INACTIVITY ไม่กระทบ operational expiry/link
- Anonymization ต้องหยุด unsent SMS/email/LINE snapshot ที่โหลดไว้โดยไม่แก้ ordinary delivery
- Disabled LINE gate ต้องอยู่ก่อน adapter และไม่มี test ใด accidentally เปิด provider

---

### Task 1: LINE Preflight and Transactional Cancellation

**Files:**
- Create: `lib/notifications/line-delivery-policy.ts`, matching tests
- Modify: `lib/notification-engine.ts`, matching tests
- Modify: `lib/line-link-service.ts`, matching tests
- Modify: provider delivery tests only for permanent-skip/no-call regression

**Interfaces:**
- Produce `cancelUnsentLineNotifications(tx, memberId, scope, reasonCode): Promise<number>`
- Produce LINE claim/preflight result consumed by existing dispatcher without provider calls inside transaction

- [ ] Write failing consent/type/link/recipient/gate/claim/fencing/race tests and real in-memory cancellation rows
- [ ] Run focused RED
- [ ] Implement smallest policy/helper/preflight and attempt-count fence; preserve SMS/email path
- [ ] Run focused GREEN, TypeScript, targeted ESLint, full suite; commit

### Task 2: Consent/Anonymization Integration and Acceptance

**Files:**
- Modify: `lib/privacy-service.ts`, `lib/privacy-anonymization.ts`, matching tests
- Modify: `README.md`, `Fitness Plan.md`, `docs/operations/production-deployment.md`

**Interfaces:**
- Consume Task 1 cancellation helper within existing transactions
- Terminalize anonymized unsent notifications all channels; preserve SENT terminal status while scrubbing PII

- [ ] Write failing withdrawal/anonymization/rollback/race tests with stored notification rows
- [ ] Run focused RED
- [ ] Implement SERVICE_PRIVACY/MARKETING/unlink/anonymization rules minimally
- [ ] Update docs with in-flight/exactly-once and external acceptance limits
- [ ] Run focused GREEN, full tests, TypeScript, ESLint, Drizzle, build, diff check and dev health; commit
