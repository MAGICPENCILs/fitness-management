# Session Timezone Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้ Session ที่เพิ่งสร้างถูกอ่านและตรวจอายุด้วย UTC อย่างสม่ำเสมอ เพื่อให้ Login ครั้งแรกเข้าสู่ Dashboard ได้โดยไม่ถูกส่งกลับหน้า Login

**Architecture:** กำหนด timezone ของ MySQL pool เป็น UTC ที่ connection boundary เพียงจุดเดียว เพื่อให้ Drizzle/MySQL แปลง JavaScript `Date` และคอลัมน์ `TIMESTAMP` เป็น instant เดียวกันทุก runtime คง schema, migration, cookie และกฎ fail-closed เดิมทั้งหมด

**Tech Stack:** Next.js 16.2.11, TypeScript, mysql2, Drizzle ORM, Vitest

## Global Constraints

- Dev server ต้องใช้ `http://localhost:3005`
- ห้ามแก้ schema หรือ migration
- แก้เฉพาะ MySQL pool configuration, regression test และคอมเมนต์ภาษาไทยที่เกี่ยวข้อง
- ฟังก์ชันและกฎธุรกิจที่เพิ่มหรือแก้ต้องมีคอมเมนต์ภาษาไทยอธิบายเหตุผล เงื่อนไข และผลข้างเคียง
- ต้องพิสูจน์ RED ก่อนแก้ production code และพิสูจน์ GREEN หลังแก้
- ห้ามบันทึก `DATABASE_URL`, password, session token, token hash หรือ auth secrets ลง test, log หรือ commit

---

### Task 1: Lock MySQL Session Timestamps to UTC

**Files:**
- Create: `db/index.test.ts`
- Modify: `db/index.ts`

**Interfaces:**
- Consumes: `mysql.createPool(options)` จาก `mysql2/promise` และ `drizzle(pool)` จาก `drizzle-orm/mysql2`
- Produces: `db` และ `closeDatabase()` เดิม โดย pool มี `timezone: "Z"`

- [ ] **Step 1: Write the failing pool-timezone test**

สร้าง `db/index.test.ts` โดย mock เฉพาะ constructor boundary และ import production module จริง:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPool: vi.fn(() => ({ end: vi.fn() })),
  drizzle: vi.fn(() => ({ kind: "database" })),
}));

vi.mock("mysql2/promise", () => ({
  default: { createPool: mocks.createPool },
}));

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: mocks.drizzle,
}));

describe("database pool timezone", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createPool.mockClear();
    mocks.drizzle.mockClear();
    process.env.DATABASE_URL = "mysql://example.invalid/fitness";
  });

  it("กำหนด UTC เพื่อให้ TIMESTAMP ของ Session แทน instant เดียวกันทุก runtime", async () => {
    await import("@/db");

    expect(mocks.createPool).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: "mysql://example.invalid/fitness",
        timezone: "Z",
      }),
    );
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run db\index.test.ts
```

Expected: FAIL เพราะ object ที่ส่งให้ `createPool` ยังไม่มี `timezone: "Z"`

- [ ] **Step 3: Add the minimal UTC pool configuration**

แก้ `db/index.ts` เฉพาะ configuration และคอมเมนต์ที่เกี่ยวข้อง:

```ts
// Pool แยก connection ต่อ transaction และบังคับ UTC เพื่อให้ TIMESTAMP ของ Session ไม่เปลี่ยนความหมายตาม timezone ของ worker
const pool = mysql.createPool({
  uri: process.env.DATABASE_URL!,
  charset: "utf8mb4_unicode_ci",
  timezone: "Z",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
```

- [ ] **Step 4: Run focused test and verify GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run db\index.test.ts
```

Expected: PASS 1 test และไม่มี error output

- [ ] **Step 5: Run related Session regression tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run db\index.test.ts lib\auth\session-service.test.ts lib\auth\session-token.test.ts lib\auth\auth-service.test.ts app\api\auth\auth-routes.test.ts
```

Expected: ทุก test ผ่าน

- [ ] **Step 6: Run static verification**

Run:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\eslint.cmd db\index.ts db\index.test.ts
git diff --check
```

Expected: ทุกคำสั่ง exit 0 และไม่มี diagnostics ใหม่

- [ ] **Step 7: Restart dev server on port 3005**

หยุดเฉพาะ process ที่ยืนยันแล้วว่า listen บน port 3005 จาก Task 11 launcher จากนั้นเปิด launcher เดิมใหม่เพื่อสร้าง process-only auth secrets และโหลด pool configuration ใหม่

Verify:

```powershell
cmd /c "netstat -ano | findstr LISTENING | findstr :3005"
```

Expected: มี listener หนึ่ง process บน `0.0.0.0:3005`/`[::]:3005` และ dev log มี `Ready`

- [ ] **Step 8: Verify the real login flow and commit**

เปิด `http://localhost:3005/login` แล้ว Login ด้วยบัญชีที่ถูกต้องหนึ่งครั้ง

Expected dev log sequence:

```text
POST /api/auth/login 200
GET / 200
```

ห้ามมี `GET / 307` คั่นกลาง หลังยืนยันแล้วให้ commit เฉพาะสองไฟล์ production/test:

```powershell
git add -- db/index.ts db/index.test.ts
git commit -m "fix: normalize session timestamps to UTC"
```
