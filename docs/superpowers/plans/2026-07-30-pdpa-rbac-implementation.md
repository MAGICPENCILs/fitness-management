# PDPA Compliance and Staff RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม consent ledger, anonymization workflow, audit log, staff accounts และ server-enforced RBAC โดยเตรียมเปลี่ยน staff cookie เป็น Login session ภายหลังได้โดยไม่รื้อ permission API

**Architecture:** แยก pure policy modules ที่ทดสอบได้ออกจาก Drizzle services แล้วให้ Route Handlers เรียก staff context และ permission guard กลาง Mutation ใหม่ใช้ transaction ที่บันทึกข้อมูลธุรกิจและ audit log พร้อมกัน ส่วน staff selector ใช้ httpOnly cookie เป็น actor provider ชั่วคราว

**Tech Stack:** Next.js 16.2.6 App Router, React 19, TypeScript, Drizzle ORM 0.45, MySQL, Vitest, Tailwind CSS 4, shadcn/ui, next-themes

## Global Constraints

- Development server และ production server ใช้พอร์ต `3005`
- อ่านคู่มือที่เกี่ยวข้องใน `node_modules/next/dist/docs/` ก่อนแก้ Next.js code
- Function และ business rule ใหม่ต้องมี comment ภาษาไทย
- ใช้ Red-Green-Refactor: production behavior ทุกชิ้นต้องมี test ที่เห็น FAIL ด้วยเหตุผลที่ถูกต้องก่อน
- Drizzle migration และ snapshot เป็น generated artifacts; ขออนุมัติผู้ใช้ให้ยกเว้น test-first เฉพาะไฟล์ generated ก่อนเริ่ม Task 2
- ใช้ `ui-skills-root` และ `ui-ux-pro-max` ก่อนเริ่ม Task 8
- รักษา Light/Dark mode, responsive layout, keyboard navigation, focus-visible และ aria-live
- Staff cookie เป็น actor context ชั่วคราว ไม่ใช่ authentication; deployment ก่อนมี Login ต้องอยู่ในเครือข่ายภายในที่เชื่อถือได้
- ห้าม audit metadata เก็บ PII, request body, before value หรือ after value
- Anonymization เก็บธุรกรรมและบัญชี แต่ล้าง PII ตาม design spec

---

## File Structure

### Files to create

- `vitest.config.ts` — Vitest aliases และ Node test environment
- `db/schema/staff.ts` — staff table และ role/status types
- `db/schema/privacy.ts` — consent events และ privacy requests
- `db/schema/audit.ts` — append-only audit logs
- `lib/rbac.ts` — permission constants, role matrix และ branch policy แบบ pure
- `lib/rbac.test.ts` — permission matrix tests
- `lib/staff-context-core.ts` — เลือก actor จาก cookie rows แบบ pure
- `lib/staff-context-core.test.ts` — bootstrap/invalid/inactive tests
- `lib/staff-service.ts` — cookie-backed actor provider และ staff management
- `lib/audit-service.ts` — sanitized audit writer และ query
- `lib/audit-policy.ts` — metadata sanitizer แบบ pure
- `lib/audit-policy.test.ts` — PII rejection tests
- `lib/consent-policy.ts` — latest consent reducer และ service-consent rules
- `lib/consent-policy.test.ts` — consent state tests
- `lib/privacy-service.ts` — consent/request/anonymization transactions
- `lib/privacy-policy.ts` — request transition, separation of duties และ anonymization plan แบบ pure
- `lib/privacy-policy.test.ts` — privacy workflow/anonymization tests
- `lib/privacy-rate-limit.ts` — fixed-window limiter
- `lib/privacy-rate-limit.test.ts` — limiter tests
- `app/api/staff/route.ts` — list/create staff
- `app/api/staff/[id]/route.ts` — update staff
- `app/api/staff/select/route.ts` — set actor cookie
- `app/api/privacy/consents/route.ts` — append consent event
- `app/api/privacy/requests/route.ts` — list/create privacy request
- `app/api/privacy/requests/[id]/review/route.ts` — approve/reject
- `app/api/privacy/requests/[id]/retry-cleanup/route.ts` — retry photo cleanup
- `app/api/audit/route.ts` — filtered paginated audit rows
- `app/settings/staff/page.tsx` — staff management page
- `app/settings/privacy/page.tsx` — privacy operations page
- `app/settings/audit/page.tsx` — audit explorer page
- `components/staff-switcher.tsx` — temporary actor selector
- `components/staff/staff-manager.tsx` — staff UI
- `components/privacy/privacy-manager.tsx` — privacy request UI
- `components/privacy/member-privacy-card.tsx` — member consent UI
- `components/audit/audit-explorer.tsx` — audit filters/table

### Files to modify

- `package.json` — test scripts and Vitest dependency
- `db/schema/index.ts` — export staff/privacy/audit schemas
- `app/layout.tsx` — load staff context and permission snapshot
- `components/sidebar.tsx` — staff selector and permission-filtered navigation
- `app/settings/page.tsx` — staff/privacy/audit setting cards
- `app/members/[id]/page.tsx` — consent history and privacy card data
- `components/members/member-detail.tsx` — render privacy card
- `app/api/members/route.ts` — required service consent and transactional audit
- `app/api/members/[id]/route.ts` — guard update and block anonymized member edits
- Existing mutation routes listed in Task 4 — permission guard and audit coverage
- `lib/crm-service.ts`, `lib/notification-engine.ts`, `lib/personal-training-service.ts` — consent-aware behavior and transaction executor support
- Generated `drizzle/0009_pdpa_rbac.sql`, `drizzle/meta/0009_snapshot.json` and journal — new tables, indexes and Owner seed

---

### Task 1: Test Harness and Permission Matrix

**Files:**
- Create: `vitest.config.ts`
- Create: `lib/rbac.test.ts`
- Create: `lib/rbac.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `Permission`, `StaffRole`, `ActorContext`, `hasPermission(actor, permission, resourceBranchId?)`, `getPermissionSnapshot(actor)`
- Consumes: none

- [ ] **Step 1: Install and configure Vitest**

Run:

```powershell
pnpm add -D vitest
```

Add scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: { environment: "node", include: ["**/*.test.ts"] },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
```

- [ ] **Step 2: Write failing permission tests**

```ts
import { describe, expect, it } from "vitest";
import { getPermissionSnapshot, hasPermission } from "@/lib/rbac";

const actor = (role: "OWNER" | "MANAGER" | "COUNTER" | "TRAINER", branchId = 2) => ({
  staffId: 10,
  role,
  homeBranchId: branchId,
});

describe("RBAC", () => {
  it("ให้ Owner จัดการความเป็นส่วนตัวข้ามสาขา", () => {
    expect(hasPermission(actor("OWNER"), "privacy.request.approve", 99)).toBe(true);
  });

  it("จำกัด Manager ให้อนุมัติคำขอในสาขาตน", () => {
    expect(hasPermission(actor("MANAGER"), "privacy.request.approve", 2)).toBe(true);
    expect(hasPermission(actor("MANAGER"), "privacy.request.approve", 3)).toBe(false);
  });

  it("ไม่ให้ Counter อนุมัติคำขอ", () => {
    expect(hasPermission(actor("COUNTER"), "privacy.request.approve", 2)).toBe(false);
  });

  it("ให้ Trainer จัดการคลาสและ PT เฉพาะสาขาตน", () => {
    expect(hasPermission(actor("TRAINER"), "classes.manage", 2)).toBe(true);
    expect(hasPermission(actor("TRAINER"), "pt.manage", 3)).toBe(false);
  });

  it("สร้าง snapshot สำหรับกรอง UI จาก matrix เดียวกัน", () => {
    expect(getPermissionSnapshot(actor("COUNTER"))).toMatchObject({
      "members.manage": true,
      "payments.manage": true,
      "accounting.manage": false,
    });
  });
});
```

- [ ] **Step 3: Run RED**

Run: `npm test -- lib/rbac.test.ts`  
Expected: FAIL because `@/lib/rbac` does not exist.

- [ ] **Step 4: Implement the minimal permission module**

Use exact permission union:

```ts
export type StaffRole = "OWNER" | "MANAGER" | "COUNTER" | "TRAINER";
export type Permission =
  | "staff.manage" | "privacy.consent.manage" | "privacy.request.create"
  | "privacy.request.approve" | "audit.read" | "members.manage"
  | "payments.manage" | "access.manage" | "classes.manage" | "pt.manage"
  | "accounting.manage" | "settings.manage";

export type ActorContext = { staffId: number; role: StaffRole; homeBranchId: number };

export const ALL_PERMISSIONS = [
  "staff.manage", "privacy.consent.manage", "privacy.request.create",
  "privacy.request.approve", "audit.read", "members.manage",
  "payments.manage", "access.manage", "classes.manage", "pt.manage",
  "accounting.manage", "settings.manage",
] as const satisfies readonly Permission[];

const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  OWNER: ["staff.manage", "privacy.consent.manage", "privacy.request.create", "privacy.request.approve", "audit.read", "members.manage", "payments.manage", "access.manage", "classes.manage", "pt.manage", "accounting.manage", "settings.manage"],
  MANAGER: ["staff.manage", "privacy.consent.manage", "privacy.request.create", "privacy.request.approve", "audit.read", "members.manage", "payments.manage", "access.manage", "classes.manage", "pt.manage", "accounting.manage", "settings.manage"],
  COUNTER: ["privacy.consent.manage", "privacy.request.create", "members.manage", "payments.manage", "access.manage", "classes.manage", "pt.manage"],
  TRAINER: ["classes.manage", "pt.manage"],
};

/** ตรวจสิทธิ์ตามบทบาทและบังคับขอบเขตสาขาสำหรับผู้ใช้ที่ไม่ใช่ Owner */
export function hasPermission(actor: ActorContext, permission: Permission, resourceBranchId = actor.homeBranchId) {
  return ROLE_PERMISSIONS[actor.role].includes(permission) &&
    (actor.role === "OWNER" || actor.homeBranchId === resourceBranchId);
}

/** สร้าง snapshot จาก matrix เดียวกับ server guard เพื่อใช้ซ่อน action ใน UI */
export function getPermissionSnapshot(actor: ActorContext) {
  return Object.fromEntries(
    ALL_PERMISSIONS.map((permission) => [permission, hasPermission(actor, permission)]),
  ) as Record<Permission, boolean>;
}
```

- [ ] **Step 5: Run GREEN and refactor**

Run: `npm test -- lib/rbac.test.ts`  
Expected: 5 tests PASS with no warnings.

- [ ] **Step 6: Commit**

```powershell
git add package.json pnpm-lock.yaml vitest.config.ts lib/rbac.ts lib/rbac.test.ts
git commit -m "test: add RBAC permission foundation"
```

---

### Task 2: Staff, Privacy and Audit Schemas with Staff Context Core

**Files:**
- Create: `db/schema/staff.ts`
- Create: `db/schema/privacy.ts`
- Create: `db/schema/audit.ts`
- Create: `lib/staff-context-core.test.ts`
- Create: `lib/staff-context-core.ts`
- Modify: `db/schema/index.ts`
- Generate: `drizzle/0009_pdpa_rbac.sql`, `drizzle/meta/0009_snapshot.json`, `drizzle/meta/_journal.json`

**Interfaces:**
- Produces: `staff`, `consentEvents`, `privacyRequests`, `privacyFileCleanups`, `auditLogs`, `resolveStaffSelection(rows, cookieValue)`
- Consumes: `StaffRole` semantics from Task 1

- [ ] **Step 1: Write failing staff selection tests**

```ts
import { describe, expect, it } from "vitest";
import { StaffContextError, resolveStaffSelection } from "@/lib/staff-context-core";

const rows = [
  { id: 1, staffCode: "OWNER001", role: "OWNER" as const, homeBranchId: 1, status: "ACTIVE" as const },
  { id: 2, staffCode: "CTR001", role: "COUNTER" as const, homeBranchId: 1, status: "INACTIVE" as const },
];

it("bootstrap ด้วย active Owner เมื่อยังไม่มี cookie", () => {
  expect(resolveStaffSelection(rows, undefined).id).toBe(1);
});

it("ไม่ fallback เป็น Owner เมื่อ cookie อ้าง inactive staff", () => {
  expect(() => resolveStaffSelection(rows, "2")).toThrow(StaffContextError);
});

it("ไม่ fallback เป็น Owner เมื่อ cookie ไม่ใช่ staff id", () => {
  expect(() => resolveStaffSelection(rows, "abc")).toThrow(StaffContextError);
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- lib/staff-context-core.test.ts`  
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure selector and run GREEN**

`resolveStaffSelection` must:

1. Return the active matching row for a valid cookie.
2. Throw `StaffContextError(401)` for malformed, missing or inactive cookie targets.
3. Only when `cookieValue === undefined`, return the first active Owner.
4. Throw `StaffContextError(503)` when no active Owner exists for bootstrap.

Run: `npm test -- lib/staff-context-core.test.ts`  
Expected: 3 tests PASS.

- [ ] **Step 4: Add exact Drizzle schemas**

Use enum values and columns from the design spec. Add these indexes:

```ts
index("staff_branch_status_idx").on(table.homeBranchId, table.status)
index("consent_member_type_created_idx").on(table.memberId, table.consentType, table.createdAt)
uniqueIndex("privacy_member_open_unique").on(table.memberId, table.openRequestKey)
index("privacy_branch_status_idx").on(table.branchId, table.status)
index("privacy_cleanup_status_idx").on(table.status, table.createdAt)
uniqueIndex("privacy_cleanup_token_unique").on(table.quarantineToken)
index("audit_branch_created_idx").on(table.branchId, table.createdAt)
index("audit_actor_created_idx").on(table.actorStaffId, table.createdAt)
```

Implement `openRequestKey` as nullable varchar populated with `ANONYMIZATION` only for PENDING/APPROVED rows; set it null for REJECTED/COMPLETED so MySQL permits historical rows.

- [ ] **Step 5: Generate and inspect migration**

Run: `npx drizzle-kit generate`  
Expected: one migration with index 0009. Rename the generated SQL file to `drizzle/0009_pdpa_rbac.sql` and update the last journal tag to `0009_pdpa_rbac`; keep `drizzle/meta/0009_snapshot.json` unchanged.

Insert after staff table creation and before foreign keys:

```sql
INSERT INTO `staff`
  (`id`, `staff_code`, `first_name`, `last_name`, `home_branch_id`, `role`, `status`)
VALUES
  (1, 'OWNER001', 'ผู้ดูแล', 'ระบบ', 1, 'OWNER', 'ACTIVE');
```

Verify table creation precedes all new foreign keys and existing data is not deleted.

- [ ] **Step 6: Run schema verification**

Run:

```powershell
npx tsc --noEmit
npx drizzle-kit migrate
```

Expected: both exit 0; migration applies once.

- [ ] **Step 7: Commit**

```powershell
git add db/schema lib/staff-context-core.ts lib/staff-context-core.test.ts drizzle
git commit -m "feat: add staff privacy and audit schemas"
```

---

### Task 3: Staff Service, Server Guard and Temporary Staff Selector

**Files:**
- Create: `lib/staff-service.ts`
- Create: `app/api/staff/route.ts`
- Create: `app/api/staff/[id]/route.ts`
- Create: `app/api/staff/select/route.ts`
- Create: `components/staff-switcher.tsx`
- Modify: `app/layout.tsx`
- Modify: `components/sidebar.tsx`

**Interfaces:**
- Consumes: `resolveStaffSelection`, `hasPermission`, `staff`
- Produces: `getStaffContext()`, `requirePermission(permission, resourceBranchId?)`, `setCurrentStaffCookie(staffId)`, staff CRUD APIs

- [ ] **Step 1: Add failing policy tests for staff management**

Extend `lib/rbac.test.ts`:

```ts
it("ไม่ให้ Manager สร้างหรือแก้ Owner", () => {
  expect(canManageStaff(actor("MANAGER", 2), { role: "OWNER", homeBranchId: 2 })).toBe(false);
});

it("ให้ Manager จัดการ non-owner ในสาขาตน", () => {
  expect(canManageStaff(actor("MANAGER", 2), { role: "COUNTER", homeBranchId: 2 })).toBe(true);
});
```

Run: `npm test -- lib/rbac.test.ts`  
Expected: FAIL because `canManageStaff` is missing.

- [ ] **Step 2: Implement `canManageStaff` and run GREEN**

Owner returns true for every target. Manager returns true only when target role is not OWNER and target branch equals actor branch. Counter/Trainer return false.

- [ ] **Step 3: Implement server-only staff service**

Use `import "server-only"`, async `cookies()` per Next.js 16 docs, cookie name `fitness_staff_id`, maxAge 1 year, `httpOnly`, `sameSite: "lax"`, `path: "/"`.

`requirePermission` throws:

```ts
export class AuthorizationError extends Error {
  constructor(message: string, public status: 401 | 403) { super(message); }
}
```

Return `{ staff, branchesAllowed, permissions }` from `getStaffContext`; never expose phone/email to the sidebar.

- [ ] **Step 4: Implement staff APIs**

Validation:

```ts
const staffSchema = z.object({
  staffCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  homeBranchId: z.coerce.number().int().positive(),
  role: z.enum(["OWNER", "MANAGER", "COUNTER", "TRAINER"]),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().email().max(100).optional(),
});
```

POST/PATCH must call `requirePermission("staff.manage", homeBranchId)` and `canManageStaff` before write. Duplicate staff code returns 409. Select route accepts only active staff and sets cookie.

- [ ] **Step 5: Build selector and wire layout**

`StaffSwitcher` receives only `{ id, staffCode, displayName, role, branchName }[]`. It POSTs to `/api/staff/select`, shows pending/error with `aria-live`, then calls `router.refresh()`. Pass permission snapshot to `Sidebar` and filter navigation through an explicit `requiredPermission` field on each item.

- [ ] **Step 6: Verify**

Run:

```powershell
npm test -- lib/rbac.test.ts lib/staff-context-core.test.ts
npx tsc --noEmit
npm run lint
```

Expected: tests PASS, typecheck/lint have 0 errors.

- [ ] **Step 7: Commit**

```powershell
git add lib/staff-service.ts lib/rbac.ts lib/rbac.test.ts app/api/staff app/layout.tsx components/sidebar.tsx components/staff-switcher.tsx
git commit -m "feat: add staff context and permission guards"
```

---

### Task 4: Audit Policy, Writer and Mutation Coverage

**Files:**
- Create: `lib/audit-policy.test.ts`
- Create: `lib/audit-policy.ts`
- Create: `lib/audit-service.ts`
- Modify: mutation routes and services listed below

**Interfaces:**
- Produces: `sanitizeAuditMetadata(value)`, `writeAudit(tx, entry)`, `runAuditedMutation(context, callback)`
- Consumes: current actor from Task 3 and `auditLogs` from Task 2

- [ ] **Step 1: Write failing sanitizer tests**

```ts
import { expect, it } from "vitest";
import { sanitizeAuditMetadata } from "@/lib/audit-policy";

it("เก็บเฉพาะ id ชื่อฟิลด์และสถานะ", () => {
  expect(sanitizeAuditMetadata({ entityId: 8, fields: ["phone", "email"], status: "COMPLETED" }))
    .toEqual({ entityId: 8, fields: ["phone", "email"], status: "COMPLETED" });
});

it.each(["firstName", "lastName", "phone", "email", "idCard", "address", "recipient", "message", "note"])(
  "ปฏิเสธ prohibited key %s",
  (key) => expect(() => sanitizeAuditMetadata({ [key]: "secret" })).toThrow("PII"),
);
```

- [ ] **Step 2: Run RED**

Run: `npm test -- lib/audit-policy.test.ts`  
Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement allowlist sanitizer and run GREEN**

Allow only keys `entityId`, `memberId`, `branchId`, `fields`, `status`, `result`, `count`, `method`, `module`, `errorCode`. Values must be number, boolean, null, enum-like string matching `/^[A-Z0-9_.-]+$/`, or arrays of allowlisted field names.

- [ ] **Step 4: Implement transactional audit API**

```ts
type AuditEntry = {
  actorStaffId: number;
  branchId: number;
  action: string;
  entityType: string;
  entityId?: number;
  result: "SUCCESS" | "DENIED" | "FAILED";
  metadata?: Record<string, unknown>;
};

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbExecutor = typeof db | DbTransaction;

/** เขียน audit ที่ผ่าน allowlist ด้วย transaction executor เดียวกับข้อมูลธุรกิจ */
export async function writeAudit(executor: DbExecutor, entry: AuditEntry): Promise<void>;
```

`runAuditedMutation` opens one `db.transaction`, invokes callback with `tx`, writes SUCCESS before commit and returns callback result. If callback throws, the business transaction rolls back, then write one sanitized FAILED audit through `db` with an enum-like `errorCode` and rethrow. Business services that already open transactions must accept a `DbExecutor` and skip opening a nested transaction when executor is provided. Update `requirePermission` so an actor-valid denial writes DENIED directly through `db`; denied requests have no business transaction to coordinate.

- [ ] **Step 5: Instrument exact mutation mapping**

| Routes | Permission | Audit action prefix |
|---|---|---|
| `/api/members`, `/api/members/[id]`, `/api/cards/*` | `members.manage` | `MEMBER_`, `CARD_` |
| `/api/payments`, `/api/coupons*`, `/api/promotions*` | `payments.manage` | `PAYMENT_`, `COUPON_`, `PROMOTION_` |
| `/api/scan` | `access.manage` | `ACCESS_SCAN_` |
| `/api/expenses`, `/api/cash-reconciliations` | `accounting.manage` | `EXPENSE_`, `CASH_RECONCILIATION_` |
| `/api/lockers*` | `access.manage` | `LOCKER_` |
| `/api/equipment*` | `settings.manage` | `EQUIPMENT_`, `MAINTENANCE_` |
| `/api/trainers`, `/api/classes*` | `classes.manage` | `TRAINER_`, `CLASS_`, `CLASS_BOOKING_` |
| `/api/pt*` | `pt.manage` | `PT_PACKAGE_`, `PT_SESSION_` |
| `/api/notification-settings`, `/api/notifications/generate` | `settings.manage` | `NOTIFICATION_` |
| `/api/crm*`, `/api/loyalty*` | `members.manage` | `CRM_`, `LOYALTY_` |
| `/api/branches*` except select | `settings.manage` | `BRANCH_` |
| `/api/branches/select`, `/api/staff/select` | active actor context | `BRANCH_CONTEXT_CHANGED`, `STAFF_CONTEXT_CHANGED` |

For each route, add guard before parsing sensitive body, pass the actor branch scope, route writes no raw body to audit, and SUCCESS audit uses entity id/status only. AuthorizationError is mapped to 401/403 consistently.

- [ ] **Step 6: Verify audit tests and all routes compile**

Run:

```powershell
npm test -- lib/audit-policy.test.ts lib/rbac.test.ts
npx tsc --noEmit
npm run lint
```

Expected: PASS and 0 errors.

- [ ] **Step 7: Commit**

```powershell
git add lib app/api
git commit -m "feat: enforce RBAC and audit mutations"
```

---

### Task 5: Consent Ledger and Consent-Aware Member Lifecycle

**Files:**
- Create: `lib/consent-policy.test.ts`
- Create: `lib/consent-policy.ts`
- Create: `app/api/privacy/consents/route.ts`
- Modify: `lib/privacy-service.ts`
- Modify: `app/api/members/route.ts`
- Modify: `lib/crm-service.ts`
- Modify: `lib/notification-engine.ts`

**Interfaces:**
- Produces: `getLatestConsent(events)`, `canCreateMember(consents)`, `appendConsentEvent(input, actor)`, `getMemberConsentSnapshot(memberId)`
- Consumes: staff guard, audit writer and consent schema

- [ ] **Step 1: Write failing consent tests**

```ts
import { expect, it } from "vitest";
import { canCreateMember, getLatestConsent } from "@/lib/consent-policy";

it("เลือก event ล่าสุดแยกตาม consent type", () => {
  expect(getLatestConsent([
    { consentType: "MARKETING", action: "GRANTED", createdAt: new Date("2026-01-01") },
    { consentType: "MARKETING", action: "WITHDRAWN", createdAt: new Date("2026-01-02") },
  ])).toMatchObject({ MARKETING: false });
});

it("สมัครไม่ได้หากไม่มี service privacy consent", () => {
  expect(canCreateMember({ SERVICE_PRIVACY: false, MARKETING: true, PHOTO: true })).toBe(false);
});

it("marketing และ photo ไม่เป็นเงื่อนไขบังคับสมัคร", () => {
  expect(canCreateMember({ SERVICE_PRIVACY: true, MARKETING: false, PHOTO: false })).toBe(true);
});
```

- [ ] **Step 2: Run RED then implement pure policy**

Run: `npm test -- lib/consent-policy.test.ts`  
Expected RED: missing exports. Implement deterministic latest-event sorting by `createdAt`, with id as tie-breaker, then rerun for GREEN.

- [ ] **Step 3: Add consent input to member creation**

Extend request schema:

```ts
consents: z.object({
  servicePrivacy: z.literal(true),
  marketing: z.boolean().default(false),
  photo: z.boolean().default(false),
  policyVersion: z.string().trim().min(1).max(30),
})
```

Create member, append three GRANTED/WITHDRAWN initialization events and write MEMBER_CREATED audit inside one transaction. Reject `photoUrl` unless PHOTO is true.

- [ ] **Step 4: Implement append-only consent route**

POST body `{ memberId, consentType, action, policyVersion, note? }`. Guard with `privacy.consent.manage`, validate member branch, append only. WITHDRAWN PHOTO validates the member upload path, moves the file to a random non-PII quarantine token, then appends the consent event, sets `photoUrl = null` and inserts a `privacy_file_cleanups` row in one transaction; restore the file if the transaction fails. WITHDRAWN SERVICE_PRIVACY sets member `SUSPENDED`. GRANTED SERVICE_PRIVACY may restore only `SUSPENDED` member to `ACTIVE`; it must not restore `CANCELLED` anonymized members.

- [ ] **Step 5: Make marketing processors consent-aware**

`crm-service` excludes members whose latest MARKETING event is not GRANTED from campaign/contact candidate queries. `notification-engine` may still create service notifications required to fulfill membership but must skip SMS/LINE/EMAIL marketing use; no existing service reminder is reclassified as marketing.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm test -- lib/consent-policy.test.ts
npx tsc --noEmit
npm run lint
```

Expected: PASS, 0 errors.

```powershell
git add lib/consent-policy* lib/privacy-service.ts lib/crm-service.ts lib/notification-engine.ts app/api/privacy/consents app/api/members/route.ts
git commit -m "feat: add member consent ledger"
```

---

### Task 6: Privacy Request State Machine and Rate Limit

**Files:**
- Create: `lib/privacy-policy.test.ts`
- Create: `lib/privacy-policy.ts`
- Create: `lib/privacy-rate-limit.test.ts`
- Create: `lib/privacy-rate-limit.ts`
- Create: `app/api/privacy/requests/route.ts`
- Create: `app/api/privacy/requests/[id]/review/route.ts`
- Modify: `lib/privacy-service.ts`

**Interfaces:**
- Produces: `canTransitionRequest`, `assertSeparateReviewer`, `consumePrivacyLimit`, request list/create/review services
- Consumes: RBAC, audit and privacy schema

- [ ] **Step 1: Write failing workflow tests**

```ts
it("อนุญาต PENDING ไป APPROVED หรือ REJECTED เท่านั้น", () => {
  expect(canTransitionRequest("PENDING", "APPROVED")).toBe(true);
  expect(canTransitionRequest("PENDING", "COMPLETED")).toBe(false);
});

it("ห้ามผู้สร้างอนุมัติคำขอของตน", () => {
  expect(() => assertSeparateReviewer(7, 7)).toThrow("คนละคน");
});

it("อนุญาตผู้อนุมัติคนอื่น", () => {
  expect(() => assertSeparateReviewer(7, 8)).not.toThrow();
});
```

Run: `npm test -- lib/privacy-policy.test.ts`  
Expected: FAIL because functions are missing. Implement exact transitions `PENDING -> APPROVED|REJECTED`, `APPROVED -> COMPLETED`; terminal states cannot transition.

- [ ] **Step 2: Write failing fixed-window tests**

Inject `now` into limiter. Consume 10 calls for key `staff:1`, assert the 11th throws 429, advance 60,000 ms and assert allowed. Run RED, implement a `Map<string, { count, resetAt }>` and run GREEN.

- [ ] **Step 3: Implement request create/list**

Create requires `privacy.request.create`, member branch access, non-anonymized member and no open request. Store `openRequestKey = "ANONYMIZATION"`. List accepts `status`, `branchId`, `from`, `to`, `page`, `pageSize <= 100`; Owner may query all branches, Manager is forced to home branch.

- [ ] **Step 4: Implement review route without completing anonymization yet**

Body:

```ts
z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reviewNote: z.string().trim().min(2).max(1000),
  confirmation: z.string().optional(),
})
```

APPROVE requires `confirmation === "ANONYMIZE"`, `privacy.request.approve`, branch access and separate reviewer. REJECT clears `openRequestKey`. Keep approved request open for Task 7.

- [ ] **Step 5: Verify and commit**

Run all policy tests, typecheck and lint. Expected PASS/0 errors.

```powershell
git add lib/privacy-policy* lib/privacy-rate-limit* lib/privacy-service.ts app/api/privacy/requests
git commit -m "feat: add privacy request workflow"
```

---

### Task 7: Transactional Anonymization and Photo Cleanup Retry

**Files:**
- Extend: `lib/privacy-policy.test.ts`
- Extend: `lib/privacy-policy.ts`
- Modify: `lib/privacy-service.ts`
- Create: `app/api/privacy/requests/[id]/retry-cleanup/route.ts`
- Modify: `app/api/privacy/requests/[id]/review/route.ts`

**Interfaces:**
- Produces: `buildAnonymizationValues(memberId, token)`, `anonymizeApprovedRequest(requestId, actor)`, `retryPrivacyFileCleanup(requestId, actor)`
- Consumes: all affected schemas, audit writer and privacy transition policy

- [ ] **Step 1: Write failing anonymization value tests**

```ts
it("สร้างค่าที่ไม่เก็บ member code เดิม", () => {
  const values = buildAnonymizationValues(42, "A1B2C3");
  expect(values).toMatchObject({
    memberCode: "ANON-42-A1B2C3",
    firstName: "ข้อมูลถูกลบ",
    status: "CANCELLED",
    idCard: null,
    phone: null,
    email: null,
    photoUrl: null,
  });
});
```

Run RED then implement a pure builder that also nulls birthDate, gender, address and note. Token is generated with `crypto.randomBytes(6).toString("hex").toUpperCase()` outside the pure function.

- [ ] **Step 2: Add transaction-level service test with a recording executor**

Use a small fake executor that records table/action/fields without holding real PII. Assert the service schedules updates for:

```ts
[
  "members", "card_pool", "access_logs", "member_crm_profiles",
  "crm_interactions", "notifications", "loyalty_points",
  "pt_packages", "pt_sessions", "payments", "locker_rentals",
  "consent_events", "privacy_requests", "privacy_file_cleanups", "audit_logs",
]
```

Assert payments amount/method/receipt and member package dates are never included in update fields. Run RED before implementation.

- [ ] **Step 3: Implement exact transaction**

ก่อน transaction ให้ตรวจว่า `photoUrl` resolve อยู่ใต้ `public/uploads/members` เท่านั้น หากมีไฟล์ให้สร้าง random quarantine token และย้ายด้วย `rename` ไปยัง `public/uploads/privacy-cleanup/{quarantineToken}` ซึ่งไม่มี member code หากย้ายไม่สำเร็จให้ตั้ง cleanup FAILED และห้ามล้างข้อมูลสมาชิก จากนั้นทำงานต่อในหนึ่ง `db.transaction`:

1. Lock request and member with `FOR UPDATE`.
2. Revalidate APPROVED state, branch and reviewer.
3. Apply member anonymization values.
4. Unassign cards and clear assignedAt.
5. Replace each access serial with `ANON-{accessLogId}`.
6. Null CRM interests/goals, set preferred contact NONE, replace interaction summary.
7. Null notification recipient/errorMessage and replace title/message.
8. Replace loyalty source/note with fixed enum-like strings.
9. Null PT measurements and text, payment note, PT package note and locker rental note.
10. Append WITHDRAWN consent events with source PRIVACY_REQUEST.
11. Insert `privacy_file_cleanups` with source ANONYMIZATION and set request `fileCleanupStatus` to PENDING when quarantine file exists, otherwise NOT_REQUIRED.
12. Write sanitized PRIVACY_ANONYMIZED audit.

After commit, delete only the quarantine path derived from the token loaded by cleanup id. If delete succeeds or file is absent, mark cleanup and request COMPLETED and clear openRequestKey. If deletion fails, mark both cleanup and request FAILED with a non-PII error code; request remains APPROVED. If database transaction fails after quarantine move, restore the file to the already validated original path; if restore fails, record `FILE_RESTORE_FAILED` and stop for manual recovery without marking the request complete.

- [ ] **Step 4: Implement retry route**

Require `privacy.request.approve`, request state APPROVED and cleanup FAILED/PENDING. If member data is not anonymized yet, retry the safe move and transaction; if member is already anonymized, retry deletion only from `public/uploads/privacy-cleanup/{quarantineToken}` loaded by the request's cleanup row. On success set request COMPLETED, cleanup COMPLETED and openRequestKey null in one transaction with audit.

- [ ] **Step 5: Run complete privacy suite**

```powershell
npm test -- lib/privacy-policy.test.ts lib/consent-policy.test.ts lib/audit-policy.test.ts
npx tsc --noEmit
npm run lint
```

Expected: all PASS, 0 errors.

- [ ] **Step 6: Commit**

```powershell
git add lib/privacy* app/api/privacy
git commit -m "feat: anonymize member personal data"
```

---

### Task 8: Staff, Privacy, Audit and Member Privacy UI

**Files:**
- Create: pages/components listed in File Structure
- Create: `components/staff/staff-manager.test.tsx`
- Create: `components/privacy/privacy-manager.test.tsx`
- Create: `components/privacy/member-privacy-card.test.tsx`
- Create: `components/privacy/privacy-fixtures.test.ts`
- Modify: `app/settings/page.tsx`, `app/members/[id]/page.tsx`, `components/members/member-detail.tsx`, `components/sidebar.tsx`

**Interfaces:**
- Consumes: serializable dashboards from staff/privacy/audit services and permission snapshot
- Produces: `StaffManager({ staff, branches, actor })`, `PrivacyManager({ requests, permissions })`, `MemberPrivacyCard({ memberId, snapshot, canManage })`, `AuditExplorer({ rows, filters, pagination })`

- [ ] **Step 1: Load UI guidance before editing**

Read `ui-skills-root/SKILL.md` and use its CLI to load the smallest relevant shadcn context. Read `ui-ux-pro-max/SKILL.md` and query dashboard, data table, destructive confirmation, dark mode and accessibility guidance. Preserve the existing project design tokens; do not introduce a second palette.

- [ ] **Step 2: Add component behavior tests before components**

Install `@testing-library/react`, `@testing-library/user-event`, `jsdom` and `@testing-library/jest-dom`. Add component tests that assert:

- Staff manager hides Owner option for Manager actor.
- Member privacy card renders all three consent states.
- Approval button stays disabled until confirmation equals `ANONYMIZE`.
- API errors render with `role="alert"`.

Each component test starts with:

```ts
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
```

Define fixtures in `components/privacy/privacy-fixtures.test.ts` and import them from both privacy test files:

```ts
export const pendingRequest = {
  id: 1,
  memberId: 20,
  memberCode: "MBR00020",
  memberName: "สมาชิก ทดสอบ",
  branchId: 1,
  branchName: "Fitness Pro สาขาหลัก",
  status: "PENDING" as const,
  reason: "สมาชิกยื่นคำขอ",
  requestedByStaffId: 2,
  requestedByName: "พนักงาน เคาน์เตอร์",
  requestedAt: "2026-07-30T00:00:00.000Z",
  fileCleanupStatus: "NOT_REQUIRED" as const,
};

export const ownerPermissions = {
  canApprove: true,
  canCreate: true,
  canRetryCleanup: true,
};

export const consentSnapshot = {
  SERVICE_PRIVACY: { granted: true, policyVersion: "2026-01", updatedAt: "2026-07-30T00:00:00.000Z", actorName: "ผู้ดูแล ระบบ" },
  MARKETING: { granted: false, policyVersion: "2026-01", updatedAt: "2026-07-30T00:00:00.000Z", actorName: "ผู้ดูแล ระบบ" },
  PHOTO: { granted: true, policyVersion: "2026-01", updatedAt: "2026-07-30T00:00:00.000Z", actorName: "ผู้ดูแล ระบบ" },
};
```

Approval confirmation test:

```tsx
it("ยังไม่ให้อนุมัติจนกว่าจะพิมพ์ ANONYMIZE", async () => {
  const user = userEvent.setup();
  render(<PrivacyManager requests={[pendingRequest]} permissions={ownerPermissions} />);
  await user.click(screen.getByRole("button", { name: "ตรวจคำขอ" }));
  const approve = screen.getByRole("button", { name: "อนุมัติและทำข้อมูลนิรนาม" });
  expect(approve).toBeDisabled();
  await user.type(screen.getByLabelText("ข้อความยืนยัน"), "ANONYMIZE");
  expect(approve).toBeEnabled();
});
```

Staff role-option test:

```tsx
it("ซ่อนบทบาท Owner เมื่อ actor เป็น Manager", async () => {
  const user = userEvent.setup();
  render(<StaffManager staff={[]} branches={[{ id: 2, name: "สาขา 2" }]} actor={{ role: "MANAGER", homeBranchId: 2 }} />);
  await user.click(screen.getByRole("button", { name: "เพิ่มพนักงาน" }));
  await user.click(screen.getByLabelText("บทบาท"));
  expect(screen.queryByRole("option", { name: "Owner" })).not.toBeInTheDocument();
});
```

Member consent test:

```tsx
it("แสดง consent ครบสามประเภท", () => {
  render(<MemberPrivacyCard memberId={1} snapshot={consentSnapshot} canManage />);
  expect(screen.getByText("การใช้ข้อมูลเพื่อให้บริการ")).toBeInTheDocument();
  expect(screen.getByText("การตลาด")).toBeInTheDocument();
  expect(screen.getByText("รูปถ่ายสมาชิก")).toBeInTheDocument();
});
```

Accessible error test uses an exported presentational `PrivacyFeedback` so it does not mock network behavior:

```tsx
it("ประกาศ API error เป็น alert", () => {
  render(<PrivacyFeedback type="error" message="ไม่สามารถอนุมัติคำขอได้" />);
  expect(screen.getByRole("alert")).toHaveTextContent("ไม่สามารถอนุมัติคำขอได้");
});
```

Run each test file and confirm RED because components do not exist.

- [ ] **Step 3: Build `/settings/staff`**

Add active/role stat cards, responsive table, branch/role/status filters, and create/edit Dialog. Buttons use explicit labels, 44px touch targets and pending states. Use `/api/staff` and refresh only after success.

- [ ] **Step 4: Build `/settings/privacy`**

Add pending/approved/cleanup-failed/completed stat cards and filterable table. Approval Dialog lists fields that will be removed, requires typed confirmation and review note, and restores focus to the trigger on close. Retry cleanup appears only for FAILED rows.

- [ ] **Step 5: Build `/settings/audit`**

Use URL search params for filters and pagination. Render actor, branch, action, entity, result, timestamp and sanitized metadata. No export in this scope. Empty/error/loading states must remain useful in Dark mode.

- [ ] **Step 6: Add Member Privacy Card**

Show three consent rows with current state, last update, actor and policy version. Consent actions open confirmation dialogs. Withdraw SERVICE_PRIVACY explains immediate suspension and offers a separate create-anonymization action. Anonymized members render read-only placeholders.

- [ ] **Step 7: Wire navigation and settings**

Add staff/privacy/audit menu entries with Lucide icons and required permissions. Remove matching items from “coming soon.” Ensure mobile sidebar scrolls and staff/branch selectors remain visible.

- [ ] **Step 8: Run component tests and accessibility checks**

Run:

```powershell
npm test
npx tsc --noEmit
npm run lint
```

Expected: all component/domain tests PASS, 0 type/lint errors.

- [ ] **Step 9: Commit**

```powershell
git add app/settings app/members components package.json pnpm-lock.yaml
git commit -m "feat: add PDPA and staff management UI"
```

---

### Task 9: Migration, Regression Verification and Browser QA

**Files:**
- Modify only files required by failures discovered through a new failing regression test

**Interfaces:**
- Consumes: complete feature
- Produces: verified application and clean repository

- [ ] **Step 1: Run full automated verification**

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Expected: every command exits 0. Existing no-img warnings must not increase; new code must add no warnings.

- [ ] **Step 2: Verify database migration and seed**

Run `npx drizzle-kit migrate` and query through a read-only script or application service to confirm:

- `OWNER001` exists once and is active.
- New tables exist.
- Existing branch/member/payment counts are unchanged.
- Foreign keys and open-request unique index work.

- [ ] **Step 3: Start and verify port 3005**

Run `npm run dev`. Confirm the log reports `http://localhost:3005` and no competing listener owns the port.

- [ ] **Step 4: Browser QA desktop and mobile**

Use the in-app Browser after reading its skill. Test:

1. Staff selector changes actor and refreshes permission-filtered navigation.
2. Counter receives 403 from a direct approve request.
3. Owner creates a temporary Counter and Manager; delete no records after test—set temporary staff INACTIVE.
4. Create a disposable member with all consent combinations; verify history.
5. Create request as Counter and approve as Manager.
6. Verify anonymized member contains no displayed PII while payment/accounting history remains.
7. Verify Light/Dark, 1280px and mobile width, keyboard focus, dialog focus return, no horizontal page overflow.
8. Check browser console has no application errors.

- [ ] **Step 5: Run final verification after QA**

Repeat `npm test`, typecheck, lint, build and `git diff --check`. Check `git status --short` contains only intended files.

- [ ] **Step 6: Final push**

Every QA fix must already have its own failing regression test and focused commit before this step. Push the verified commit sequence:

```powershell
git push origin main
```

Expected: remote `main` advances to the verified local commit and working tree is clean.
