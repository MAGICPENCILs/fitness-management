# LINE Member Link Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม LINE member-link lifecycle ที่พิสูจน์ผ่าน signed webhook, ยกเลิกได้และถูกล้างตาม PDPA โดยยังไม่เปิด outbound LINE delivery

**Architecture:** ตารางเฉพาะเก็บ identifier/challenge hash โดยไม่ขยาย member DTO. Staff route ออก one-time command; exact public webhook ตรวจ HMAC บน bounded raw bytes แล้ว lock member→link row เพื่อ consume challenge. Privacy flows ลบ row ใน transaction เดิม และ Member Detail แสดง status/issue/unlink ผ่าน API โดยใช้ design tokens เดิม

**Tech Stack:** Next.js 16.4 Route Handlers/Proxy, TypeScript, Drizzle/MySQL, Node crypto/streams, React, Vitest

**Spec:** `docs/superpowers/specs/2026-11-08-line-member-link-design.md`

## Global Constraints

- ไม่เพิ่ม dependency, ไม่อ่าน/พิมพ์ secret และไม่ทำ network/provider call
- Outbound LINE generation/settings/UI/health gates ต้องยังปิด และห้ามเพิ่ม link→notification-recipient wiring
- ฟังก์ชัน/กฎธุรกิจที่เพิ่มหรือแก้ต้องมีคอมเมนต์ภาษาไทยอธิบายเหตุผล เงื่อนไขสำคัญ หรือผลข้างเคียง
- Route/Proxy changes ต้องอิง installed Next docs; webhook protocol อิง official LINE docs ใน spec
- Challenge อายุ 15 นาที, token 32-byte base64url/43 chars, body limit 256 KiB, exact public route เท่านั้น
- Staff action ตรวจ authoritative session, resource branch RBAC และ trusted Origin; webhook ไม่ใช้ Origin แต่ต้องผ่าน HMAC raw-body verification
- ใช้ TDD, migration non-destructive, port 3005 และคืน dev server หลัง verification
- UI reuse component/theme patterns เดิม, semantic light/dark tokens, touch target ≥44px, visible focus, accessible status/error/confirmation

## Review Focus

- Forwarded/stolen bearer challenge และ raw LINE ID injection ต้องไม่เปิดทาง staff/client claim โดยตรง
- Dishonest/missing Content-Length และ tampered raw bytes ต้องถูกจำกัด/ปฏิเสธก่อน parse โดยไม่ allocation ไม่จำกัด
- Multi-event partial commit/redelivery, duplicate LINE uniqueness และ lock ordering ต้องไม่ link ผิดคนหรือ deadlock จาก flow ในแอป
- Withdrawal/anonymization race กับ completion ต้องจบด้วย privacy-consistent state และ audit atomic
- Whole-row member callers, logs, responses และ UI ต้องไม่เผย LINE ID/token/hash/signature/payload

---

### Task 1: Schema, Core Service and Signed Routes

**Files:**
- Create: `db/schema/member-line-links.ts`
- Modify: `db/schema/index.ts`
- Create: generated `drizzle/0018_*.sql`, snapshot and journal entry
- Create: `lib/line-link-policy.ts`, `lib/line-link-policy.test.ts`
- Create: `lib/line-link-service.ts`, `lib/line-link-service.test.ts`
- Create: `app/api/members/[id]/line-link/route.ts`, route tests
- Create: `app/api/line/webhook/route.ts`, route tests
- Modify: `lib/auth/route-policy.ts`, `lib/auth/route-policy.test.ts`, `proxy.test.ts`

**Interfaces:**
- Produces `LineLinkStatus = { status: "UNLINKED" | "PENDING" | "LINKED"; challengeExpiresAt: string | null; linkedAt: string | null }`
- Produces `getLineLinkStatus(actor, memberId)`, `issueLineLinkChallenge(actor, memberId)`, `removeLineLink(actor, memberId)`, `completeLineLinkChallenge(token, lineUserId)`
- Produces raw-body helpers for bounded read and LINE signature verification without exporting secrets

- [ ] Write failing policy/service/route tests for state contract, 15-minute expiry/rotation/consumption, POST-on-LINKED 409, role/branch/CSRF, raw-ID rejection, exact public route, body limit, signature-before-parse, empty/multi events, duplicate/no-op/500 outcomes, audit rollback and no provider call
- [ ] Run focused tests and capture RED
- [ ] Add schema and generate non-destructive migration named `member_line_links`; inspect SQL/snapshot/journal for only the new table, constraints and FKs
- [ ] Implement minimum native-crypto/bounded-stream/service/routes code; acquire member→link locks and recheck consent/state under lock
- [ ] Run focused GREEN, TypeScript and targeted ESLint; commit Task 1

### Task 2: PDPA Lifecycle Integration

**Files:**
- Modify: `lib/privacy-anonymization.ts`, `lib/privacy-anonymization.test.ts`
- Modify: `lib/privacy-service.ts`, `lib/privacy-service.test.ts`
- Modify: LINE service tests for deterministic race/rollback coverage if shared fixtures require it

**Interfaces:**
- Consumes `memberLineLinks` schema from Task 1
- Extends anonymization plan with `DELETE member_line_links` before `members`
- SERVICE_PRIVACY withdrawal deletes link/pending row inside the existing member-locked transaction

- [ ] Write failing tests proving withdrawal/anonymization remove identifier/challenge atomically and rollback restores state; add completion-vs-withdrawal/anonymization race cases using existing deterministic transaction pattern
- [ ] Run focused tests and capture RED
- [ ] Implement the minimal deletion cases without changing existing request→member lock order, financial retention or consent semantics
- [ ] Run focused GREEN, TypeScript and targeted ESLint; commit Task 2

### Task 3: Member Detail UI, Readiness Copy and Full Acceptance

**Files:**
- Create: `components/members/line-link-card.tsx`, matching test
- Modify: `components/members/member-detail.tsx`, matching test only where composition changes
- Modify: `components/settings/notification-manager.tsx`, matching test if copy is covered
- Modify: `README.md`, `Fitness Plan.md`, `docs/operations/production-deployment.md`

**Interfaces:**
- Consumes staff API from Task 1; never renders LINE ID/hash
- Displays UNLINKED/PENDING/LINKED, once-only issuance command, expiry, copy action and confirmed unlink

- [ ] Write failing component tests for status load, issue once-only command, refresh-without-token, copy label, confirmation, pending/linked timestamps, loading/error/aria-live and no secret/identifier rendering
- [ ] Run focused tests and capture RED
- [ ] Implement the smallest standalone card using existing Button/Dialog/card/theme patterns; keep 375px responsive and light/dark semantic tokens
- [ ] Update disabled LINE copy/docs to say lifecycle exists but delivery/provider acceptance remains blocked; do not enable controls or health
- [ ] Run focused GREEN, full `npm test`, `npx tsc --noEmit`, `npm run lint`, `npx drizzle-kit generate`, `npm run build`, `git diff --check`; verify dev health on port 3005
- [ ] Record real-credential/MySQL/provider acceptance blockers honestly and commit Task 3
