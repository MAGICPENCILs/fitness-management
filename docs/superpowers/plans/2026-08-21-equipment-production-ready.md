# Equipment Production-Ready Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ยกระดับระบบอุปกรณ์เดิมให้รองรับ lifecycle เลิกใช้งาน, RBAC แบบ read/manage, pagination/filter, optimistic concurrency, Audit และ UI ที่ใช้งานได้จริงทุกบทบาท

**Architecture:** คงตารางและ Route Handlers เดิมเป็นฐาน แล้วแยก pure domain rules, Drizzle repository และ service orchestration ออกจาก UI ขนาดใหญ่ ทุก mutation ใช้ row lock + version compare-and-set ภายใน transaction เดียวกับ Audit ส่วน Server Component เป็นผู้ parse URL/load DTO และส่ง permission snapshot ให้ client render แบบ read-only หรือ manage

**Tech Stack:** Next.js 16.2.11 App Router, React 19.2.4, TypeScript, Drizzle ORM/MySQL, Zod 4, Vitest 4, Testing Library, Tailwind CSS 4, shadcn/Radix UI

**Spec:** `docs/superpowers/specs/2026-08-21-equipment-production-ready-design.md`

## Global Constraints

- รหัสอุปกรณ์ไม่ซ้ำทั้งบริษัท; ห้ามเพิ่ม API เปลี่ยน `branchId`
- ห้ามลบอุปกรณ์หรือ maintenance history จริง; ใช้ `RETIRED` พร้อมเหตุผล 2–500 ตัวอักษร
- Owner/Manager มี `equipment.manage`; Owner/Manager/Counter/Trainer มี `equipment.read`
- ทุก mutation ตรวจ trusted Origin, authoritative Session, permission และ branch scope
- ทุก mutation ของ row เดิมใช้ `expectedVersion`, row lock, `affectedRows === 1` และเพิ่ม version ทีละ 1
- อุปกรณ์ `RETIRED` เพิ่มมิเตอร์ เปลี่ยนสถานะ หรือเพิ่ม maintenance ไม่ได้
- รอบนี้ไม่มี restore จาก `RETIRED` และไม่มี branch transfer; ทั้งสองเรื่องต้องออกแบบกฎ/Audit แยกก่อนเพิ่มภายหลัง
- Audit ห้ามเก็บ note, serial, retirement free-text, token, hash, raw IP หรือ full user-agent
- เขียนคอมเมนต์ฟังก์ชันและกฎธุรกิจเป็นภาษาไทย โดยอธิบายเหตุผล เงื่อนไข และผลข้างเคียง
- ก่อนแก้ Next.js page/route ให้อ่าน `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` และ `route.md` ครบถ้วน
- UI ใช้ semantic tokens/components เดิม, 44px targets, keyboard/focus/ARIA และ Light/Dark mode
- ใช้ UI Skills CLI เพียงหนึ่ง bounded attempt; หาก environment block ให้ใช้ `fixing-accessibility` และ `ui-ux-pro-max` local skill fallback โดยไม่วนรอ CLI
- ไม่แตะ Login diagnostic หรือ auth hard-navigation changes ที่ยังอยู่เฉพาะ dirty `main`
- ทุก task ทำ RED → GREEN → focused regression → typecheck/diff check → commit แยก
- baseline full Vitest มี load-sensitive timeout เดิมหนึ่ง test; focused bootstrap 10/10 ผ่าน ห้ามแก้ timeout นี้ใน scope ระบบอุปกรณ์

---

## File Responsibility Map

### Domain and data

- `db/schema/equipment.ts` — persistent columns, enum และ indexes เท่านั้น
- `lib/equipment-core.ts` — pure types, strict date rules, maintenance-state derivation และ Zod schemas
- `lib/equipment-repository.ts` — Drizzle reads, counts, locks และ compare-and-set writes
- `lib/equipment-service.ts` — branch/lifecycle orchestration และ safe DTO mapping
- `lib/equipment-http.ts` — แปลง Zod/domain/auth failures เป็น fixed HTTP responses โดยไม่ log raw error

### Server boundaries

- `app/(protected)/equipment/page.tsx` — parse async `searchParams`, authoritative read permission และ load dashboard
- `app/api/equipment/route.ts` — create only
- `app/api/equipment/[id]/route.ts` — detail GET, master PUT และ operation PATCH
- `app/api/equipment/[id]/maintenance/route.ts` — append maintenance
- `app/api/equipment/[id]/retire/route.ts` — retire lifecycle

### UI

- `components/equipment/equipment-types.ts` — serializable UI contracts
- `components/equipment/equipment-dashboard.tsx` — client state shell, tab/filter/pagination wiring
- `components/equipment/equipment-summary.tsx` — summary cards
- `components/equipment/equipment-filters.tsx` — URL-backed filters
- `components/equipment/equipment-list.tsx` — desktop table/mobile cards
- `components/equipment/maintenance-history.tsx` — paginated history views
- `components/equipment/equipment-detail-dialog.tsx` — detail and per-equipment history
- `components/equipment/equipment-form-dialog.tsx` — create/edit registry
- `components/equipment/equipment-operation-dialog.tsx` — meter/status
- `components/equipment/equipment-maintenance-dialog.tsx` — append maintenance
- `components/equipment/equipment-retire-dialog.tsx` — destructive confirmation with reason
- `components/equipment/equipment-manager.tsx` — removed after consumers migrate

---

### Task 1: Persist Retirement and Versioned Equipment Rows

**Files:**
- Modify: `db/schema/equipment.ts`
- Create: `db/schema/equipment-schema.test.ts`
- Create: `drizzle/0011_equipment_production_ready.sql`
- Create/Modify: `drizzle/meta/0011_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

**Interfaces:**
- Produces: `EquipmentStatus = "OPERATIONAL" | "MAINTENANCE" | "OUT_OF_SERVICE" | "RETIRED"`
- Produces persisted fields: `retiredAt: Date | null`, `retiredReason: string | null`, `version: number`
- Preserves: global unique `equipment.code`

- [ ] **Step 1: Write schema RED tests**

```ts
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { equipment } from "@/db/schema/equipment";

describe("equipment production schema", () => {
  it("เก็บ retirement และ version โดยไม่ถอด unique code", () => {
    const config = getTableConfig(equipment);
    expect(equipment.status.enumValues).toContain("RETIRED");
    expect(equipment.retiredAt).toBeDefined();
    expect(equipment.retiredReason).toBeDefined();
    expect(equipment.version.notNull).toBe(true);
    expect(equipment.version.hasDefault).toBe(true);
    expect(equipment.code.isUnique).toBe(true);
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "equipment_branch_status_idx",
        "equipment_branch_category_idx",
        "equipment_branch_next_maintenance_date_idx",
      ]),
    );
  });
});
```

- [ ] **Step 2: Run schema test and record RED**

Run: `node_modules\.bin\vitest.cmd run db\schema\equipment-schema.test.ts`
Expected: FAIL because `RETIRED`, retirement columns, version and composite indexes do not exist.

- [ ] **Step 3: Add minimal schema fields and indexes**

```ts
status: mysqlEnum("status", [
  "OPERATIONAL",
  "MAINTENANCE",
  "OUT_OF_SERVICE",
  "RETIRED",
]).notNull().default("OPERATIONAL"),
retiredAt: timestamp("retired_at"),
retiredReason: varchar("retired_reason", { length: 500 }),
version: int("version").notNull().default(1),
```

Replace single-column query indexes with branch-first composite indexes while retaining the global unique code constraint.

- [ ] **Step 4: Generate migration from the exact schema entrypoint**

Run: `node_modules\.bin\drizzle-kit.cmd generate --name equipment_production_ready`
Expected: creates migration `0011_*`, snapshot and journal entry; no import of test files because `drizzle.config.ts` targets `db/schema/index.ts` exactly.

- [ ] **Step 5: Add migration safety assertions**

Extend the test to read the generated SQL and assert:

```ts
expect(sqlText).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/i);
expect(sqlText).toContain("RETIRED");
expect(sqlText).toContain("retired_at");
expect(sqlText).toContain("retired_reason");
expect(sqlText).toContain("version");
```

- [ ] **Step 6: Verify GREEN and static checks**

Run:

```powershell
node_modules\.bin\vitest.cmd run db\schema\equipment-schema.test.ts
node_modules\.bin\tsc.cmd --noEmit --pretty false
git diff --check
```

Expected: schema test PASS, typecheck exit 0, diff check clean.

- [ ] **Step 7: Commit**

```powershell
git add db/schema/equipment.ts db/schema/equipment-schema.test.ts drizzle
git commit -m "feat: add equipment retirement lifecycle schema"
```

---

### Task 2: Add Equipment Read/Manage RBAC Boundaries

**Files:**
- Modify: `lib/rbac.ts`
- Modify: `lib/auth/route-policy.ts`
- Modify: `components/sidebar.tsx`
- Modify: `app/(protected)/equipment/page.tsx`
- Modify: `lib/auth/route-policy.test.ts`
- Modify: `components/sidebar.test.tsx`
- Create: `lib/equipment-rbac.test.ts`

**Interfaces:**
- Produces permissions: `"equipment.read"`, `"equipment.manage"`
- Owner/Manager: read + manage
- Counter/Trainer: read only
- Page consumes authoritative `requirePermission("equipment.read", branchId)`

- [ ] **Step 1: Write role matrix and page-policy RED tests**

```ts
it.each([
  ["OWNER", true, true],
  ["MANAGER", true, true],
  ["COUNTER", true, false],
  ["TRAINER", true, false],
] as const)("กำหนด equipment permissions ให้ %s", (role, canRead, canManage) => {
  const actor = { staffId: 1, role, homeBranchId: 10 };
  expect(hasPermission(actor, "equipment.read", 10)).toBe(canRead);
  expect(hasPermission(actor, "equipment.manage", 10)).toBe(canManage);
});

expect(decideRouteAccess("/equipment", counterClaims)).toEqual({ type: "ALLOW" });
```

Update Sidebar test so Counter/Trainer permission snapshots render the equipment link but not settings-only links.

- [ ] **Step 2: Run focused tests and record RED**

Run:

```powershell
node_modules\.bin\vitest.cmd run lib\equipment-rbac.test.ts lib\auth\route-policy.test.ts components\sidebar.test.tsx
```

Expected: FAIL because the new Permission literals and matrix entries do not exist.

- [ ] **Step 3: Implement the exact permission matrix**

Add both permissions to `Permission` and `ALL_PERMISSIONS`; include both for Owner/Manager and only `equipment.read` for Counter/Trainer. Change `/equipment` policy and Sidebar item from `settings.manage` to `equipment.read`.

In the page, use:

```ts
const branchId = await getCurrentBranchId();
const actor = await requirePermission("equipment.read", branchId);
const canManage = hasPermission(actor, "equipment.manage", branchId);
```

Pass `canManage` to the existing manager temporarily; do not redesign UI in this task.

- [ ] **Step 4: Verify GREEN and protected inventory**

Run:

```powershell
node_modules\.bin\vitest.cmd run lib\equipment-rbac.test.ts lib\auth\route-policy.test.ts components\sidebar.test.tsx lib\auth\protected-route-inventory.test.ts
node_modules\.bin\tsc.cmd --noEmit --pretty false
git diff --check
```

Expected: focused tests PASS and no protected route loses its authoritative guard.

- [ ] **Step 5: Commit**

```powershell
git add lib/rbac.ts lib/auth/route-policy.ts components/sidebar.tsx 'app/(protected)/equipment/page.tsx' lib/equipment-rbac.test.ts lib/auth/route-policy.test.ts components/sidebar.test.tsx
git commit -m "feat: add equipment read and manage permissions"
```

---

### Task 3: Extract Tested Equipment Domain Rules and Input Schemas

**Files:**
- Create: `lib/equipment-core.ts`
- Create: `lib/equipment-core.test.ts`
- Modify: `lib/equipment-service.ts`
- Modify: `app/api/equipment/route.ts`
- Modify: `app/api/equipment/[id]/route.ts`
- Modify: `app/api/equipment/[id]/maintenance/route.ts`

**Interfaces:**
- Produces: `EquipmentCategory`, `EquipmentStatus`, `MaintenanceType`, `MaintenanceStatus`, `MaintenanceState`
- Produces: `getMaintenanceState(item, today)`
- Produces schemas: `dashboardFiltersSchema`, `createEquipmentSchema`, `updateEquipmentMasterSchema`, `updateEquipmentOperationSchema`, `maintenanceSchema`, `retireEquipmentSchema`
- Produces: `parseStrictCalendarDate(value): string`

- [ ] **Step 1: Write pure-rule RED tests**

Cover literal boundaries:

```ts
expect(getMaintenanceState({ currentUsageHours: 100, nextMaintenanceHours: 99, nextMaintenanceDate: null }, "2026-08-21").maintenanceState).toBe("OVERDUE");
expect(getMaintenanceState({ currentUsageHours: 100, nextMaintenanceHours: 150, nextMaintenanceDate: null }, "2026-08-21").maintenanceState).toBe("DUE_SOON");
expect(() => parseStrictCalendarDate("2026-02-30")).toThrow();
expect(retireEquipmentSchema.parse({ reason: "ชำรุดถาวร", expectedVersion: 3 })).toEqual({ reason: "ชำรุดถาวร", expectedVersion: 3 });
expect(updateEquipmentMasterSchema.safeParse({ branchId: 2, expectedVersion: 1 }).success).toBe(false);
```

Also cover empty optional dates, warranty before purchase, completed maintenance without completedDate, invalid page, oversized search and `RETIRED` operation attempts at the service boundary.

- [ ] **Step 2: Run core tests and record RED**

Run: `node_modules\.bin\vitest.cmd run lib\equipment-core.test.ts`
Expected: FAIL because `equipment-core.ts` does not exist.

- [ ] **Step 3: Implement pure types, date parsing and Zod schemas**

Use strict round-trip validation:

```ts
export function parseStrictCalendarDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("INVALID_CALENDAR_DATE");
  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (parsed.toISOString().slice(0, 10) !== value) throw new Error("INVALID_CALENDAR_DATE");
  return value;
}
```

`dashboardFiltersSchema` normalizes to fixed `pageSize: 20`; schemas strip no unknown business fields silently—use strict objects where mutation safety matters.

- [ ] **Step 4: Replace duplicate route/service enums and schemas**

Import contracts from `equipment-core.ts`; do not change endpoint behavior yet. Keep Thai function comments aligned with extracted responsibility.

- [ ] **Step 5: Verify GREEN and existing API compilation**

Run:

```powershell
node_modules\.bin\vitest.cmd run lib\equipment-core.test.ts
node_modules\.bin\tsc.cmd --noEmit --pretty false
node_modules\.bin\eslint.cmd lib\equipment-core.ts lib\equipment-core.test.ts lib\equipment-service.ts app\api\equipment\route.ts 'app/api/equipment/[id]/route.ts' 'app/api/equipment/[id]/maintenance/route.ts'
git diff --check
```

Expected: all commands exit 0 with no new warnings.

- [ ] **Step 6: Commit**

```powershell
git add lib/equipment-core.ts lib/equipment-core.test.ts lib/equipment-service.ts app/api/equipment
git commit -m "refactor: centralize equipment domain rules"
```

---

### Task 4: Add Paginated, Branch-Scoped Equipment Reads

**Files:**
- Create: `lib/equipment-repository.ts`
- Create: `lib/equipment-read-service.test.ts`
- Modify: `lib/equipment-service.ts`
- Modify: `app/(protected)/equipment/page.tsx`

**Interfaces:**
- Produces `EquipmentDashboardFilters`
- Produces `EquipmentDashboardDto` with `{ summary, equipment, history, equipmentPagination, historyPagination }`
- Produces `EquipmentDetailDto`
- Produces `getEquipmentDashboard(today, branchId, filters)` and `getEquipmentDetail(today, branchId, equipmentId, historyPage)`

- [ ] **Step 1: Write read-service RED tests with a narrow fake repository**

Define a complete repository fixture and assert:

```ts
const result = await service.getEquipmentDashboard("2026-08-21", 10, {
  search: "BIKE",
  status: "OPERATIONAL",
  category: "CARDIO",
  maintenance: "DUE_SOON",
  tab: "equipment",
  page: 2,
  historyPage: 1,
  pageSize: 20,
});

expect(repo.lastListInput).toMatchObject({ branchId: 10, limit: 20, offset: 20 });
expect(result.equipmentPagination).toEqual({ page: 2, pageSize: 20, total: 43, totalPages: 3 });
expect(result.summary.total).toBe(90);
```

The fake summary fixture is 90 branch-wide rows while the filtered equipment total is 43. Add cases proving counts are branch-wide, maintenance filters are applied before pagination, history is not capped at 50, detail rejects cross-branch/not-found, and all Date/Decimal values are serialized.

- [ ] **Step 2: Run read tests and record RED**

Run: `node_modules\.bin\vitest.cmd run lib\equipment-read-service.test.ts`
Expected: FAIL because repository/read DTO interfaces do not exist.

- [ ] **Step 3: Implement Drizzle read repository**

Create repository methods with exact inputs:

```ts
export interface EquipmentReadRepository {
  getSummary(branchId: number, today: string): Promise<EquipmentSummaryRow>;
  listEquipment(input: EquipmentListQuery): Promise<{ rows: EquipmentRow[]; total: number }>;
  listMaintenance(input: MaintenanceListQuery): Promise<{ rows: MaintenanceRow[]; total: number }>;
  findEquipmentDetail(branchId: number, equipmentId: number): Promise<EquipmentRow | null>;
}
```

Use branch-first SQL conditions. Search only code/name/serial/location. Derive maintenance conditions in SQL from current hours, next hours and the supplied Bangkok date so pagination occurs after filtering.

- [ ] **Step 4: Implement DTO mapping and page integration**

Read and follow Next 16 async `searchParams` docs. Parse a single string per key; invalid values fall back to safe defaults. Never pass raw `searchParams` into repository.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
node_modules\.bin\vitest.cmd run lib\equipment-core.test.ts lib\equipment-read-service.test.ts
node_modules\.bin\tsc.cmd --noEmit --pretty false
node_modules\.bin\eslint.cmd lib\equipment-repository.ts lib\equipment-service.ts 'app/(protected)/equipment/page.tsx'
git diff --check
```

- [ ] **Step 6: Commit**

```powershell
git add lib/equipment-repository.ts lib/equipment-service.ts lib/equipment-read-service.test.ts 'app/(protected)/equipment/page.tsx'
git commit -m "feat: paginate equipment dashboard data"
```

---

### Task 5: Enforce Versioned Registry, Operation and Retirement Mutations

**Files:**
- Modify: `lib/equipment-repository.ts`
- Modify: `lib/equipment-service.ts`
- Create: `lib/equipment-mutation-service.test.ts`
- Create: `lib/equipment-repository.test.ts`
- Modify: `lib/audit-policy.ts`
- Modify: `lib/audit-policy.test.ts`

**Interfaces:**
- Produces: `updateEquipmentMaster(id, branchId, input, tx)`
- Produces: `updateEquipmentOperation(id, branchId, input, tx)`
- Produces: `retireEquipment(id, branchId, input, retiredAt, tx)`
- All inputs include `expectedVersion`
- All successful returns include `{ equipmentId, version }`

- [ ] **Step 1: Write service and production-repository RED tests**

Cover:

```ts
await expect(service.updateEquipmentOperation(7, 10, {
  currentUsageHours: 99,
  status: "OPERATIONAL",
  expectedVersion: 4,
}, tx)).rejects.toMatchObject({ status: 400 });

await expect(service.retireEquipment(7, 10, {
  reason: "ชำรุดถาวร",
  expectedVersion: 3,
}, NOW, tx)).resolves.toEqual({ equipmentId: 7, version: 4 });
```

Production repository fake must assert `FOR UPDATE`, `id + branchId`, version predicate, `affectedRows === 1`, no writes on stale version, and rollback-compatible executor use. Add one stateful transaction regression that executes the production mutation inside `runAuditedMutation`; force Audit insert failure and prove the equipment row/version and audit list both roll back.

- [ ] **Step 2: Run tests and record RED**

Run: `node_modules\.bin\vitest.cmd run lib\equipment-mutation-service.test.ts lib\equipment-repository.test.ts lib\audit-policy.test.ts`
Expected: FAIL because versioned mutation APIs and audit field allowlist do not exist.

- [ ] **Step 3: Implement row lock and compare-and-set helper**

Repository helper contract:

```ts
async function lockEquipment(tx: DbTransaction, equipmentId: number, branchId: number) {
  const [row] = await tx.select().from(equipment)
    .where(and(eq(equipment.id, equipmentId), eq(equipment.branchId, branchId)))
    .for("update").limit(1);
  if (!row) throw new EquipmentOperationError("ไม่พบอุปกรณ์", 404);
  return row;
}
```

Each update uses `WHERE id AND branch_id AND version`, increments via SQL, and throws 409 if affected rows are not exactly one. The transaction-bound service/repository must not commit independently; the Route Handler supplies the same `tx` from `runAuditedMutation` so the equipment write and Audit record share one commit boundary.

- [ ] **Step 4: Implement lifecycle invariants**

- Master update cannot receive branch, meter, status or retirement fields.
- Operation rejects decreasing meter and `RETIRED`.
- Retirement rejects already retired and stores reason/time.
- Global code collision returns 409 without exposing SQL error.

- [ ] **Step 5: Extend Audit allowlist minimally**

Add only equipment field names used in `fields`, plus enum-like `maintenanceType`/`maintenanceStatus` keys. Prove free-text reason, note and serial values are rejected from metadata.

- [ ] **Step 6: Verify GREEN and rollback behavior**

Run:

```powershell
node_modules\.bin\vitest.cmd run lib\equipment-mutation-service.test.ts lib\equipment-repository.test.ts lib\audit-policy.test.ts
node_modules\.bin\tsc.cmd --noEmit --pretty false
git diff --check
```

- [ ] **Step 7: Commit**

```powershell
git add lib/equipment-repository.ts lib/equipment-service.ts lib/equipment-mutation-service.test.ts lib/equipment-repository.test.ts lib/audit-policy.ts lib/audit-policy.test.ts
git commit -m "feat: enforce equipment lifecycle concurrency"
```

---

### Task 6: Make Maintenance Writes Atomic and Retirement-Safe

**Files:**
- Modify: `lib/equipment-repository.ts`
- Modify: `lib/equipment-service.ts`
- Create: `lib/equipment-maintenance.test.ts`

**Interfaces:**
- Produces: `recordMaintenance(equipmentId, branchId, input, tx): Promise<{ maintenanceId: number; equipmentVersion: number }>`
- Consumes `MaintenanceInput` with `expectedVersion`

- [ ] **Step 1: Write maintenance RED tests**

Test scheduled, in-progress and completed rows independently. Required regressions:

```ts
await expect(service.recordMaintenance(7, 10, {
  type: "REPAIR",
  status: "COMPLETED",
  scheduledDate: "2026-08-21",
  completedDate: "2026-08-21",
  usageHoursAtService: 550,
  cost: 1200,
  expectedVersion: 4,
}, tx)).resolves.toEqual({ maintenanceId: 31, equipmentVersion: 5 });
```

Assert completed work recalculates next hours, in-progress sets `MAINTENANCE`, scheduled does not falsely change operational status, retired/stale/decreasing meter reject with zero insert/update/audit, and insert/update/Audit failures roll back. The Audit-failure case must execute the production maintenance mutation through `runAuditedMutation`, not only a fake service delegation.

- [ ] **Step 2: Run and record RED**

Run: `node_modules\.bin\vitest.cmd run lib\equipment-maintenance.test.ts`
Expected: FAIL because maintenance input lacks version and retired checks.

- [ ] **Step 3: Implement one-transaction maintenance mutation**

Lock equipment, validate lifecycle/version/meter, insert maintenance row, update equipment and increment version. Do not add update-existing-work behavior reserved for round 2.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
node_modules\.bin\vitest.cmd run lib\equipment-maintenance.test.ts lib\equipment-mutation-service.test.ts lib\equipment-repository.test.ts
node_modules\.bin\tsc.cmd --noEmit --pretty false
git diff --check
```

- [ ] **Step 5: Commit**

```powershell
git add lib/equipment-repository.ts lib/equipment-service.ts lib/equipment-maintenance.test.ts
git commit -m "feat: harden equipment maintenance transactions"
```

---

### Task 7: Harden Equipment Route Handlers and Add Detail/Retire Endpoints

**Files:**
- Create: `lib/equipment-http.ts`
- Create: `app/api/equipment/equipment-routes.test.ts`
- Modify: `app/api/equipment/route.ts`
- Modify: `app/api/equipment/[id]/route.ts`
- Modify: `app/api/equipment/[id]/maintenance/route.ts`
- Create: `app/api/equipment/[id]/retire/route.ts`
- Modify: `lib/auth/protected-route-inventory.test.ts`

**Interfaces:**
- GET detail requires `equipment.read`
- POST/PUT/PATCH/maintenance/retire require `equipment.manage`
- Produces fixed response bodies `{ message, id?, version? }` and `{ error }`

- [ ] **Step 1: Read Next 16 Route Handler docs completely**

Read: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`
Record conventions used: async `params`, supported methods, uncached mutation behavior and `NextResponse` API.

- [ ] **Step 2: Write route RED tests**

Use complete Request fixtures and mock only service/security boundaries. Cover:

- untrusted Origin rejected before JSON parse/service
- malformed JSON 400
- missing Session 401
- Counter/Trainer mutation 403
- Manager cross-branch 404/403 without data leak
- stale version 409
- safe 500 logging excludes token/hash/code/SQL params sentinels
- GET detail available to all four roles
- retirement response returns next version
- inventory discovers every exported method and canonical guard import

- [ ] **Step 3: Run route tests and record RED**

Run:

```powershell
node_modules\.bin\vitest.cmd run app\api\equipment\equipment-routes.test.ts lib\auth\protected-route-inventory.test.ts
```

Expected: FAIL on missing endpoints, missing Origin, old permission and unsafe raw logging.

- [ ] **Step 4: Implement shared safe error mapper**

```ts
export function equipmentErrorResponse(error: unknown): NextResponse {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: "ข้อมูลอุปกรณ์ไม่ถูกต้อง" }, { status: 400 });
  }
  if (error instanceof AuthorizationError || error instanceof EquipmentOperationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Equipment route unavailable", error instanceof Error ? error.name : "UNKNOWN_ERROR");
  return NextResponse.json({ error: "ไม่สามารถดำเนินการกับอุปกรณ์ได้" }, { status: 500 });
}
```

Do not reflect arbitrary server messages in the unknown branch.

- [ ] **Step 5: Implement handlers in security order**

Mutation order: Origin → authoritative branch/session/permission → params/body validation → audited transaction → response. GET detail omits Origin but requires authoritative read permission and branch scope.

Use these Audit actions exactly: `EQUIPMENT_CREATED`, `EQUIPMENT_MASTER_UPDATED`, `EQUIPMENT_OPERATION_UPDATED`, `MAINTENANCE_RECORDED`, `EQUIPMENT_RETIRED`. The actor comes from the authoritative Session, the branch/entity identity comes from the validated/locked row, and only allowlisted metadata is passed. Every handler invokes `runAuditedMutation` so the domain write and Audit insert use the same transaction; Audit failure must roll back the mutation.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
node_modules\.bin\vitest.cmd run app\api\equipment\equipment-routes.test.ts lib\auth\protected-route-inventory.test.ts lib\audit-policy.test.ts
node_modules\.bin\tsc.cmd --noEmit --pretty false
node_modules\.bin\eslint.cmd lib\equipment-http.ts app\api\equipment
git diff --check
```

- [ ] **Step 7: Commit**

```powershell
git add lib/equipment-http.ts app/api/equipment lib/auth/protected-route-inventory.test.ts
git commit -m "feat: secure equipment api boundaries"
```

---

### Task 8: Build the Paginated Read-Only Equipment Dashboard

**Files:**
- Create: `components/equipment/equipment-types.ts`
- Create: `components/equipment/equipment-dashboard.tsx`
- Create: `components/equipment/equipment-summary.tsx`
- Create: `components/equipment/equipment-filters.tsx`
- Create: `components/equipment/equipment-list.tsx`
- Create: `components/equipment/maintenance-history.tsx`
- Create: `components/equipment/equipment-pagination.tsx`
- Create: `components/equipment/equipment-dashboard.test.tsx`
- Modify: `app/(protected)/equipment/page.tsx`

**Interfaces:**
- Dashboard consumes `EquipmentDashboardDto`, `today`, `canManage`
- Filter state is server-owned through URL search params
- Counter/Trainer receive `canManage=false`

- [ ] **Step 1: Load minimal UI guidance**

Try `npx.cmd ui-skills categories` once with a 30-second cap. If unavailable, read local `fixing-accessibility/SKILL.md` and `ui-ux-pro-max/SKILL.md`, selecting only dashboard/table/form/accessibility guidance. Record fallback in task report.

- [ ] **Step 2: Write read-only UI RED tests**

Cover:

```tsx
render(<EquipmentDashboard {...fixture} canManage={false} />);
expect(screen.getByText("พร้อมใช้งาน 12 เครื่อง")).toBeVisible();
expect(screen.getByRole("link", { name: "หน้าถัดไป" })).toHaveAttribute("href", expect.stringContaining("page=2"));
expect(screen.queryByRole("button", { name: "เพิ่มอุปกรณ์" })).not.toBeInTheDocument();
```

Also assert URL filter preservation, tab-specific page reset, desktop table + mobile card semantics, empty/filter-empty states, maintenance labels with text/icons, and no color-only meaning.

- [ ] **Step 3: Run UI tests and record RED**

Run: `node_modules\.bin\vitest.cmd run components\equipment\equipment-dashboard.test.tsx`
Expected: FAIL because split components do not exist.

- [ ] **Step 4: Implement serializable types and focused components**

Use semantic cards/tables and shared labels in `equipment-types.ts`; keep form state out of read-only components. Pagination is links, not client-only slicing.

- [ ] **Step 5: Wire Server Component props**

Await `searchParams`, parse through `dashboardFiltersSchema`, load DTO and pass `canManage`. Preserve force-dynamic behavior.

- [ ] **Step 6: Verify GREEN and responsive semantics**

Run:

```powershell
node_modules\.bin\vitest.cmd run components\equipment\equipment-dashboard.test.tsx lib\equipment-read-service.test.ts
node_modules\.bin\tsc.cmd --noEmit --pretty false
node_modules\.bin\eslint.cmd components\equipment 'app/(protected)/equipment/page.tsx'
git diff --check
```

- [ ] **Step 7: Commit**

```powershell
git add components/equipment 'app/(protected)/equipment/page.tsx'
git commit -m "feat: add paginated equipment dashboard"
```

---

### Task 9: Add Accessible Manage and Detail Dialogs

**Files:**
- Create: `components/equipment/equipment-client-response.ts`
- Create: `components/equipment/equipment-detail-dialog.tsx`
- Create: `components/equipment/equipment-form-dialog.tsx`
- Create: `components/equipment/equipment-operation-dialog.tsx`
- Create: `components/equipment/equipment-maintenance-dialog.tsx`
- Create: `components/equipment/equipment-retire-dialog.tsx`
- Create: `components/equipment/equipment-actions.test.tsx`
- Modify: `components/equipment/equipment-dashboard.tsx`
- Modify: `components/equipment/equipment-list.tsx`
- Delete: `components/equipment/equipment-manager.tsx`

**Interfaces:**
- Dialogs consume a selected `EquipmentItem` including `version`
- Successful mutation returns `version`; UI closes, announces and calls `router.refresh()`
- 409 announces fixed stale-data copy and refreshes without retrying mutation automatically

- [ ] **Step 1: Write interaction RED tests**

Cover create/edit/operation/maintenance/retire independently:

- controls render only when `canManage=true`
- explicit labels and field-error associations
- pending disables submit and duplicate clicks
- Escape closes; trigger regains focus
- create/edit dates and warranty errors
- retirement requires reason and visible irreversible consequence
- 401 hard-navigates `/login`, 403 refreshes/goes safe page as existing auth UI convention dictates
- 409 shows “ข้อมูลถูกแก้ไขแล้ว กรุณาตรวจสอบข้อมูลล่าสุด” and refreshes
- HTML/empty/network/arbitrary server errors map to fixed Thai copy
- success uses `aria-live` and never displays returned raw body

- [ ] **Step 2: Run interaction tests and record RED**

Run: `node_modules\.bin\vitest.cmd run components\equipment\equipment-actions.test.tsx`
Expected: FAIL because dialogs/client sanitizer do not exist.

- [ ] **Step 3: Implement safe response reader**

```ts
export async function readEquipmentClientResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  const value: unknown = await response.json().catch(() => null);
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return {
    message: typeof record.message === "string" ? record.message : undefined,
    error: typeof record.error === "string" ? record.error : undefined,
    version: typeof record.version === "number" ? record.version : undefined,
  };
}
```

The dialog chooses fixed copy by status; do not display unknown `error` strings for 500/network paths.

- [ ] **Step 4: Implement dialogs and detail loading**

Use existing Button/Input/Label/Select/Dialog/Table components. Keep each dialog’s form and request logic local. Detail GET may load on open and must expose stable pending/error regions.

- [ ] **Step 5: Remove the old monolith only after all consumers move**

Search: `rg "EquipmentManager|equipment-manager"`
Expected before delete: only old file/import; after page migration no remaining references.

- [ ] **Step 6: Verify GREEN and accessibility regressions**

Run:

```powershell
node_modules\.bin\vitest.cmd run components\equipment\equipment-actions.test.tsx components\equipment\equipment-dashboard.test.tsx
node_modules\.bin\tsc.cmd --noEmit --pretty false
node_modules\.bin\eslint.cmd components\equipment
rg "EquipmentManager|equipment-manager" app components lib
git diff --check
```

Expected: tests/typecheck/lint pass; final `rg` returns no references.

- [ ] **Step 7: Commit**

```powershell
git add components/equipment 'app/(protected)/equipment/page.tsx'
git commit -m "feat: add equipment management workflows"
```

---

### Task 10: Integration Verification, Migration Preflight and Handoff

**Files:**
- Create: `docs/superpowers/reports/2026-08-21-equipment-production-ready-report.md`
- Modify only if verification finds an in-scope defect: files from Tasks 1–9 plus their tests

**Interfaces:**
- Consumes all Task 1–9 contracts
- Produces verification evidence and merge/migration/browser handoff; does not migrate production automatically

- [ ] **Step 1: Run focused equipment suite**

Run:

```powershell
node_modules\.bin\vitest.cmd run db\schema\equipment-schema.test.ts lib\equipment-core.test.ts lib\equipment-read-service.test.ts lib\equipment-mutation-service.test.ts lib\equipment-repository.test.ts lib\equipment-maintenance.test.ts app\api\equipment\equipment-routes.test.ts components\equipment\equipment-dashboard.test.tsx components\equipment\equipment-actions.test.tsx
```

Expected: all equipment files/tests pass, zero unhandled errors.

- [ ] **Step 2: Run related security regressions**

Run:

```powershell
node_modules\.bin\vitest.cmd run lib\equipment-rbac.test.ts lib\auth\route-policy.test.ts lib\auth\protected-route-inventory.test.ts lib\audit-policy.test.ts components\sidebar.test.tsx
```

Expected: all pass.

- [ ] **Step 3: Run full automated verification sequentially**

Run each command separately with a 10-minute cap:

```powershell
node_modules\.bin\vitest.cmd run
node_modules\.bin\tsc.cmd --noEmit --pretty false
node_modules\.bin\eslint.cmd .
node_modules\.bin\next.cmd build
git diff --check main...HEAD
```

If the known bootstrap test times out under full load, run its focused file once and record both results without changing the timeout. Do not claim full suite passed unless exit code is 0.

- [ ] **Step 4: Inspect migration and secret boundaries**

Run:

```powershell
rg -n "\b(DROP|DELETE|TRUNCATE)\b" drizzle/0011_equipment_production_ready.sql
git diff main...HEAD -- . ':!package-lock.json' | rg -n "password|secret|token|sessionTokenHash|DATABASE_URL"
```

Expected: no destructive migration statement; any secret-keyword hits are identifiers/tests only and manually classified in the report.

- [ ] **Step 5: Database preflight without mutation**

With approved environment access, record only safe aggregates:

- database identity/schema name without URL/host credentials
- current migration journal latest tag
- equipment and maintenance row counts
- duplicate global equipment code count
- rows with invalid status/date/version invariants

Do not run migration until backup plan and explicit user approval.

- [ ] **Step 6: Write final report**

Include commits, schema/migration summary, test counts/exit codes, known baseline timeout, warnings, DB preflight status, deferred round 2–3 scope, and browser QA matrix. Never include credentials, hashes, raw rows or PII.

- [ ] **Step 7: Commit report**

```powershell
git add docs/superpowers/reports/2026-08-21-equipment-production-ready-report.md
git commit -m "docs: report equipment production readiness"
```

- [ ] **Step 8: Review before integration**

Request a specification review and code-quality review for `main...codex/equipment-production-ready`. Fix Critical/Important findings with separate RED/GREEN commits and re-review each fix range.

- [ ] **Step 9: Integration handoff**

After review approval, report:

- exact branch/head
- clean worktree status
- migration still not applied
- main still contains uncommitted Login diagnostic work and requires deliberate reconciliation
- port 3005 browser QA must happen only after safe merge/restart with existing auth secrets

Do not merge, migrate, restart or push without the corresponding explicit authorization.
