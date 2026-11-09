# LINE Provider Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ Owner จัดเก็บ LINE credentials ผ่าน Settings แบบ encrypted/write-only โดย webhook ใช้ config เดียวกันและ outbound LINE ยังปิด

**Architecture:** แยก singleton provider table/service/API ออกจาก notification rules. AES-256-GCM ใช้ external purpose-specific key; browser รับเฉพาะ safe DTO. Webhook resolve DB-first/env-fallback เฉพาะเมื่อยังไม่มี row และทุก outbound gate คงเดิม

**Tech Stack:** Next.js 16.4.4, TypeScript, Drizzle/MySQL, Zod, node:crypto, Vitest/RTL, existing RBAC/audit/UI primitives

**Spec:** `docs/superpowers/specs/2026-11-09-line-provider-settings-design.md`

## Global Constraints

- OWNER เท่านั้นแก้ global credentials; Manager/role อื่นต้องไม่ได้ secret DTO หรือ mutation authority
- Secret write-only: ห้าม plaintext/ciphertext/suffix/hash ใน response, RSC props, logs หรือ audit
- `PROVIDER_CONFIG_ENCRYPTION_KEY` เป็น external base64 32-byte key แยกจาก key อื่น
- DB row มีอยู่แล้วห้าม fallback env; ไม่มี rowเท่านั้นจึง fallback env
- First DB cutover ต้องมี destination และ explicit replace/clear operation สำหรับ secret ทั้งสอง field
- Save/clear/configured state ไม่เปิด outbound LINE และไม่เรียก provider
- ห้ามเปลี่ยน OA เมื่อมี linked member, active challenge หรือ unsent LINE; expired unlinked challenge ไม่ block
- Missing/wrong master key หรือ decrypt failure ห้าม partial UI recovery; fail closed
- Thai comments อธิบายเหตุผล/gate/side effects; ไม่เพิ่ม dependency

## Review Focus

- Missing/wrong key หรือ tampered/field-swapped ciphertext ต้อง fail closed โดยไม่รั่ว error
- Manager/Origin denial ต้องเกิดก่อน parse body/DB write
- Explicit clear ต้องไม่ทำให้ env credential เก่ากลับมา
- First-cutover omission ต้องไม่ทำให้ env credential หรือ destination หายเงียบ ๆ
- Concurrent Owner updates ต้องได้ 409 ไม่ overwrite revision ใหม่
- Webhook DB resolver failure ต้องไม่ fallback env หลัง DB row มีอยู่

---

### Task 1: Encryption, Schema and Migration

**Files:**
- Create: `lib/provider-credentials-crypto.ts`, matching tests
- Create: `db/schema/line-provider-settings.ts`
- Modify: `db/schema/index.ts`, `lib/rbac.ts`, matching tests
- Generate: Drizzle migration/snapshot/journal `0019_line_provider_settings`

**Interfaces:**
- Produce `encryptProviderCredential(value, field, key): string`
- Produce `decryptProviderCredential(payload, field, key): string`
- Produce `lineProviderSettings` singleton schema and `provider.credentials.manage` Owner-only permission

- [ ] Write RED tests for key length, roundtrip, tamper, wrong key, malformed envelope, field AAD swap and RBAC matrix
- [ ] Implement versioned AES-256-GCM envelope and additive schema minimally
- [ ] Generate migration and verify snapshot changes only the new table/permission code
- [ ] Run focused GREEN, TypeScript, targeted ESLint, Drizzle check and commit

### Task 2: Owner-only Service, API and Webhook Resolver

**Files:**
- Create: `lib/line-provider-settings-service.ts`, matching tests
- Create: `app/api/notification-provider-settings/route.ts`, matching tests
- Modify: `app/api/line/webhook/route.ts`, matching tests
- Modify: `.env.example`, `README.md`, `docs/operations/production-deployment.md`

**Interfaces:**
- Produce `getLineProviderSettingsDto(actor): Promise<LineProviderSettingsDto>`
- Produce `updateLineProviderSettings(actor, input): Promise<LineProviderSettingsDto>`
- Produce `resolveLineWebhookCredentials(): Promise<{ channelSecret: string; destination?: string } | null>`
- Consume Task 1 crypto/schema/permission

- [ ] Write RED tests for auth/Owner/Origin, safe DTO, preserve/replace/clear, first-cutover completeness, blank/control/oversize, revision 409, rollback/audit, env precedence, lifecycle identity guards, expired-challenge cleanup and decrypt-failure no-partial-write
- [ ] Implement strict bounded Zod contract, transactional CAS/audit and fixed safe errors; no raw error logging
- [ ] Change webhook to async shared resolver while preserving bounded signature-before-parse and exact public route; DB-row decrypt failure must 503 without env fallback
- [ ] Verify zero provider calls and every existing outbound gate remains disabled
- [ ] Run focused GREEN, full tests, TypeScript, ESLint, Drizzle and commit

### Task 3: Owner Settings UI and Acceptance

**Files:**
- Create: `components/settings/line-provider-settings-card.tsx`, matching RTL tests
- Modify: `app/(protected)/settings/notifications/page.tsx`, page tests
- Modify: `components/settings/notification-manager.tsx` only for current disabled copy if needed

**Interfaces:**
- Consume Task 2 safe DTO/API
- Owner receives provider DTO/card; Manager receives no credential DTO/card

- [ ] Write RED RTL/page tests for Owner/Manager props, empty write-only inputs, labels/descriptions, preserve/replace/clear confirmation, reset on success/error, copy fallback and outbound-disabled copy
- [ ] Implement minimal accessible responsive card with uncontrolled FormData and safe fixed feedback
- [ ] Run UI skills accessibility/dark-mode checklist, focused GREEN, full suite, TypeScript, ESLint and build; document removal of legacy env secrets and old-artifact webhook rollback guard
- [ ] Create encrypted backup + dry-run restore, apply migration 0019, verify schema/health port 3005, commit, merge, push and monitor CI

