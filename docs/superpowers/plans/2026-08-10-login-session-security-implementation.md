# Login, Session และ Authentication Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างระบบ Login/Logout และ database session ที่ปลอดภัย เชื่อม Staff/RBAC เดิม จำกัด Login ผิด บังคับ password lifecycle บันทึก audit และให้ Owner/Manager ตรวจ security state ได้

**Architecture:** ใช้ Argon2id สำหรับ password, signed minimal session claims ใน HttpOnly cookie และเก็บเฉพาะ hash ของ session ID ใน MySQL `proxy.ts` ทำ optimistic route checks ขณะที่ session DAL และ `requirePermission` ตรวจฐานข้อมูล/Staff/RBAC จริงทุกครั้ง Authentication state, rate limit และ audit ใช้ transaction หรือ atomic database operations และ Admin Security อ่านข้อมูลผ่าน service ที่จำกัด branch/role

**Tech Stack:** Next.js 16.2.11 App Router/Proxy, React 19.2.4, TypeScript, MySQL, Drizzle ORM, `@node-rs/argon2`, `jose`, Zod, Vitest, Testing Library, Tailwind CSS, shadcn/ui

## Global Constraints

- อ่าน `node_modules/next/dist/docs/01-app/02-guides/authentication.md`, `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` และ API reference ที่เกี่ยวข้องก่อนแก้ Next.js code
- Function และ business rule ที่เพิ่มหรือแก้ต้องมี comment ภาษาไทย อธิบายเหตุผล เงื่อนไขสำคัญ และผลข้างเคียง
- Development และ production server ใช้ port `3005`
- Session absolute lifetime 8 ชั่วโมง, idle timeout 30 นาที และ touch interval 5 นาที
- ACCOUNT limit คือ 5 ครั้งใน 15 นาทีแล้วล็อก 15 นาที; IP limit คือ 20 ครั้งใน 15 นาทีแล้วล็อก 15 นาทีและใช้ได้เฉพาะ `TRUST_PROXY=true` เท่านั้น หากไม่ใช่ `true` ห้ามสร้าง IP fingerprint หรือ origin/global fallback bucket และใช้เฉพาะ ACCOUNT limit
- Password ขั้นต่ำ 12 ตัว มี uppercase, lowercase, number และ special character
- Production ต้องมี `AUTH_SESSION_SECRET`, `AUTH_FINGERPRINT_SECRET`, `APP_ORIGIN`; ห้าม fallback secret ใน source code
- ห้ามเก็บ plaintext/hash ของ password, raw session ID/cookie, staff code ที่ไม่พบ, raw IP หรือ full user-agent ใน log/audit/response
- Staff Switcher เปิดได้เฉพาะ `NODE_ENV=development` และ `ENABLE_DEV_STAFF_SWITCHER=true`; production endpoint ต้องตอบ 404
- ก่อน UI task ต้องใช้ `ui-skills-root` เลือก context แล้วใช้ `ui-ux-pro-max`; ตรวจ dark mode, responsive และ accessibility
- ใช้ TDD: เขียน test ให้ fail ด้วยเหตุผลที่คาด → implementation ขั้นต่ำ → test ผ่าน → commit

## File Structure Map

- `lib/auth/constants.ts`: อายุ session, rate-limit thresholds, cookie name และ audit action constants
- `lib/auth/types.ts`: session claims, authenticated Staff, Login input/result และ security status types
- `lib/auth/password.ts`: password policy, Argon2id hash/verify และ dummy verification
- `lib/auth/session-token.ts`: สร้าง session ID, sign/verify claims และ hash token
- `lib/auth/request-security.ts`: Origin, safe return path, trusted-proxy IP fingerprint และ user-agent category
- `lib/auth/rate-limit-core.ts`: state transition ของ fixed window/lock โดยไม่แตะฐานข้อมูล
- `lib/auth/auth-repository.ts`: Drizzle queries/transactions สำหรับ Staff, limit, session และ auth audit
- `lib/auth/auth-service.ts`: Login, Logout, change password และ session lifecycle
- `lib/auth/session-service.ts`: authoritative session DAL สำหรับ Server Components/Route Handlers
- `lib/auth/route-policy.ts`: path → permission และ proxy decision แบบ pure
- `lib/auth/security-service.ts`: Admin Security query/revoke/unlock พร้อม branch boundary
- `db/schema/auth.ts`: `auth_sessions` และ `auth_login_limits`
- `proxy.ts`: optimistic cookie/role/mode guard
- `app/(auth)/*`: Login และ forced password change
- `app/(protected)/layout.tsx`: authoritative application shell
- `app/api/auth/*`: Login, Logout และ password change handlers
- `app/api/security/*`: Admin sessions/rate-limits management
- `components/auth/*`: Login, password change, current Staff และ Logout UI
- `components/security/security-console.tsx`: Admin Security tabs/tables/actions
- `scripts/bootstrap-owner.ts`: bootstrap/rotate `OWNER001` จาก environment

---

### Task 1: Security primitives และ dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/auth/constants.ts`
- Create: `lib/auth/types.ts`
- Create: `lib/auth/password.ts`
- Create: `lib/auth/password.test.ts`
- Create: `lib/auth/session-token.ts`
- Create: `lib/auth/session-token.test.ts`
- Create: `lib/auth/request-security.ts`
- Create: `lib/auth/request-security.test.ts`

**Interfaces:**
- Produces: `validatePassword(password): PasswordValidation`, `hashPassword(password): Promise<string>`, `verifyPassword(hash, password): Promise<boolean>`
- Produces: `createSessionId(): string`, `hashSessionId(id): string`, `signSessionClaims(claims): Promise<string>`, `verifySessionClaims(cookie): Promise<SessionClaims | null>`
- Produces: `assertTrustedOrigin(request): void`, `getSafeReturnPath(value): string`, `getRequestFingerprintInput(request): RequestFingerprintInput`

- [ ] **Step 1: Install exact auth tooling**

Run:

```powershell
npm install @node-rs/argon2 jose
npm install --save-dev tsx
```

Add script:

```json
"auth:bootstrap-owner": "tsx scripts/bootstrap-owner.ts"
```

- [ ] **Step 2: Write failing password tests**

```ts
it("บังคับ password policy ครบทุกประเภท", () => {
  expect(validatePassword("ValidPass#2026")).toEqual({ valid: true, errors: [] });
  expect(validatePassword("short").valid).toBe(false);
});

it("hash และ verify โดยไม่คืน plaintext", async () => {
  const hash = await hashPassword("ValidPass#2026");
  expect(hash).not.toContain("ValidPass#2026");
  await expect(verifyPassword(hash, "ValidPass#2026")).resolves.toBe(true);
  await expect(verifyPassword(hash, "WrongPass#2026")).resolves.toBe(false);
});
```

- [ ] **Step 3: Run RED password tests**

Run: `npx vitest run lib/auth/password.test.ts`  
Expected: FAIL เพราะ module/functions ยังไม่มี

- [ ] **Step 4: Implement password adapter and constants**

ใช้ Argon2id ด้วย `memoryCost=19456`, `timeCost=2`, `parallelism=1`, `outputLen=32` และ version 0x13 ทั้ง hash จริงและ dummy hash export เฉพาะ policy/hash/verify functions และเก็บ dummy hash ฝั่ง server เท่านั้น

```ts
export type PasswordValidation = { valid: boolean; errors: string[] };
export function validatePassword(password: string): PasswordValidation;
export async function hashPassword(password: string): Promise<string>;
export async function verifyPassword(hash: string, password: string): Promise<boolean>;
```

- [ ] **Step 5: Write RED token/request tests**

```ts
it("round-trips signed minimal claims and rejects tampering", async () => {
  const validClaims: SessionClaims = {
    sessionId: "session-id-for-test",
    staffId: 1,
    role: "OWNER",
    homeBranchId: 1,
    mode: "FULL",
    expiresAt: 1786377600,
  };
  const token = await signSessionClaims(validClaims);
  await expect(verifySessionClaims(token)).resolves.toEqual(validClaims);
  await expect(verifySessionClaims(`${token}x`)).resolves.toBeNull();
});

it("accepts only local relative return paths", () => {
  expect(getSafeReturnPath("/members?tab=active")).toBe("/members?tab=active");
  expect(getSafeReturnPath("//evil.example")).toBe("/");
  expect(getSafeReturnPath("https://evil.example")).toBe("/");
});
```

- [ ] **Step 6: Implement token and request security primitives**

Use `jose` HS256 with `AUTH_SESSION_SECRET`, `crypto.randomBytes(32)` for session ID, SHA-256 for DB token hash, HMAC-SHA256 for fingerprint, exact Origin comparison with `APP_ORIGIN`, and coarse user-agent categories `DESKTOP`, `MOBILE`, `TABLET`, `BOT`, `UNKNOWN`. สร้าง IP fingerprint เฉพาะเมื่อ `TRUST_PROXY=true` และมี forwarded IP ที่ trusted; กรณีอื่นคืนสถานะไม่มี IP fingerprint เพื่อให้ Task 3 ใช้เฉพาะ ACCOUNT limit.

- [ ] **Step 7: Run GREEN and commit**

Run: `npx vitest run lib/auth/password.test.ts lib/auth/session-token.test.ts lib/auth/request-security.test.ts`  
Expected: PASS

```powershell
git add package.json package-lock.json lib/auth
git commit -m "feat: add authentication security primitives"
```

### Task 2: Authentication database schema และ migration

**Files:**
- Modify: `db/schema/staff.ts`
- Modify: `db/schema/audit.ts`
- Modify: `db/schema/index.ts`
- Create: `db/schema/auth.ts`
- Create: `db/schema/auth-schema.test.ts`
- Create: `drizzle/0010_auth_sessions.sql`
- Create: `drizzle/meta/0010_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

**Interfaces:**
- Produces: `authSessions`, `authLoginLimits`, `AuthSession`, `AuthLoginLimit`
- Changes: `auditLogs.branchId` and `auditLogs.actorStaffId` become nullable
- Changes: Staff adds `passwordHash`, `passwordChangedAt`, `mustChangePassword`

- [ ] **Step 1: Write failing schema contract tests**

Use Drizzle `getTableConfig` to assert exact SQL column/index names:

```ts
const sessionConfig = getTableConfig(authSessions);
const limitConfig = getTableConfig(authLoginLimits);
const auditConfig = getTableConfig(auditLogs);
expect(sessionConfig.columns.map((column) => column.name)).toEqual(expect.arrayContaining([
  "session_token_hash", "mode", "last_seen_at", "absolute_expires_at",
  "idle_expires_at", "revoked_at", "revoked_reason",
]));
expect(limitConfig.uniqueConstraints.map((item) => item.name)).toContain("auth_limit_scope_subject_unique");
expect(auditConfig.columns.find((column) => column.name === "actor_staff_id")?.notNull).toBe(false);
```

- [ ] **Step 2: Run RED schema test**

Run: `npx vitest run db/schema/auth-schema.test.ts`  
Expected: FAIL เพราะ auth schema/columns ยังไม่มี

- [ ] **Step 3: Implement Drizzle schema**

Use enums exactly:

```ts
mode: mysqlEnum("mode", ["FULL", "PASSWORD_CHANGE_REQUIRED"]),
scope: mysqlEnum("scope", ["ACCOUNT", "IP"]),
revokedReason: mysqlEnum("revoked_reason", [
  "LOGOUT", "PASSWORD_CHANGED", "PASSWORD_RESET", "STAFF_UPDATED",
  "ADMIN_REVOKED", "EXPIRED",
]),
```

Add indexes for staff/status/expiry, scope/lockedUntil and nullable audit branch/createdAt.

- [ ] **Step 4: Generate and inspect migration**

Run: `npx drizzle-kit generate --name auth_sessions`  
Expected: creates `drizzle/0010_auth_sessions.sql` and matching snapshot/journal entry

Inspect that migration adds nullable Staff password fields first, creates both auth tables, then alters audit foreign keys to nullable without dropping existing audit rows.

- [ ] **Step 5: Run GREEN and commit**

Run: `npx vitest run db/schema/auth-schema.test.ts`  
Expected: PASS

```powershell
git add db/schema drizzle
git commit -m "feat: add authentication database schema"
```

### Task 3: Persistent rate limit และ Login service

**Files:**
- Create: `lib/auth/rate-limit-core.ts`
- Create: `lib/auth/rate-limit-core.test.ts`
- Create: `lib/auth/auth-errors.ts`
- Create: `lib/auth/auth-repository.ts`
- Create: `lib/auth/auth-service.ts`
- Create: `lib/auth/auth-service.test.ts`
- Modify: `db/index.ts` and test to use a MySQL pool so concurrent transactions lease independent connections
- Modify: `lib/auth/password.ts` and test to expose `verifyPasswordOrDummy` while keeping the dummy hash private
- Modify: `lib/auth/request-security.ts` and test to reuse one HMAC helper for ACCOUNT/IP subjects

**Interfaces:**
- Produces: `evaluateRateLimit(state, policy, now): RateLimitDecision`
- Produces: `login(input: LoginInput, request: AuthRequestContext): Promise<LoginResult>`
- Produces: `logout(sessionCookie: string | undefined, request: AuthRequestContext): Promise<void>`
- Produces: `createAuthService(repository, dependencies)` for repository-fake service tests
- Consumes: password/session/request primitives and auth schema from Tasks 1-2

- [ ] **Step 1: Write RED rate-limit transition tests**

```ts
it("locks account on the fifth failure in one window", () => {
  const now = new Date("2026-08-10T04:00:00.000Z");
  const decision = evaluateRateLimit({ attempts: 4, windowStartedAt: now, lockedUntil: null }, ACCOUNT_POLICY, now);
  expect(decision).toMatchObject({ attempts: 5, blocked: true });
  expect(decision.lockedUntil).toEqual(new Date(now.getTime() + 15 * 60_000));
});

it("starts a clean window after lock expiry", () => {
  const now = new Date("2026-08-10T04:30:00.000Z");
  const old = new Date("2026-08-10T04:00:00.000Z");
  const decision = evaluateRateLimit({ attempts: 5, windowStartedAt: old, lockedUntil: old }, ACCOUNT_POLICY, now);
  expect(decision).toMatchObject({ attempts: 1, blocked: false });
});
```

- [ ] **Step 2: Run RED and implement pure state machine**

Run: `npx vitest run lib/auth/rate-limit-core.test.ts`  
Expected: FAIL, then PASS after implementing immutable decisions for ACCOUNT/IP policies

- [ ] **Step 3: Write RED Login service tests with repository fake**

```ts
it("returns generic failure, consumes both buckets and audits invalid password", async () => {
  await expect(login({ staffCode: "OWNER001", password: "WrongPass#2026", returnTo: "/" }, ctx))
    .rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
  expect(repo.failedScopes).toEqual(["ACCOUNT", "IP"]);
  expect(repo.audits.at(-1)).toMatchObject({ action: "LOGIN_FAILED", result: "FAILED" });
});

it("creates PASSWORD_CHANGE_REQUIRED session for temporary password", async () => {
  const result = await login(validTemporaryCredential, ctx);
  expect(result.claims.mode).toBe("PASSWORD_CHANGE_REQUIRED");
});
```

- [ ] **Step 4: Implement repository transaction boundaries**

`AuthRepository` must expose exact operations:

```ts
findLoginStaff(staffCode: string): Promise<LoginStaff | null>;
checkLimit(scope: "ACCOUNT" | "IP", subjectHash: string, now: Date): Promise<RateLimitCheck>;
consumeFailure(scope: "ACCOUNT" | "IP", subjectHash: string, now: Date): Promise<RateLimitDecision>;
writeLoginAudit(input: LoginAuditInput): Promise<void>;
createSessionAndAudit(input: CreateSessionInput): Promise<void>;
revokeSessionAndAudit(input: RevokeSessionInput): Promise<void>;
```

`checkLimit` is read-only so a valid credential cannot bypass an existing lock. Implement `consumeFailure` atomically with row lock/transaction so concurrent requests cannot pass threshold. `writeLoginAudit` writes one event only after ACCOUNT/IP decisions, avoiding duplicate events per bucket. `CreateSessionInput` carries the ACCOUNT subject hash so its delete, session insert and `LOGIN_SUCCESS` audit commit or roll back in one repository transaction.

- [ ] **Step 5: Implement Login/Logout orchestration**

Unknown Staff must verify against a fixed dummy Argon2id hash before returning the same `INVALID_CREDENTIALS` message. Successful Login clears only ACCOUNT bucket, creates 8-hour/30-minute session, writes `LOGIN_SUCCESS`; Logout revokes before cookie deletion and remains idempotent.

- [ ] **Step 6: Run GREEN and commit**

Run: `npx vitest run lib/auth/rate-limit-core.test.ts lib/auth/auth-service.test.ts`  
Expected: PASS including concurrent threshold fake

```powershell
git add lib/auth
git commit -m "feat: add persistent login and rate limiting"
```

### Task 4: Authoritative session DAL และ Staff/RBAC integration

**Files:**
- Create: `lib/auth/session-service.ts`
- Create: `lib/auth/session-service.test.ts`
- Modify: `lib/staff-service.ts`
- Modify: `lib/staff-context-core.ts`
- Modify: `lib/staff-context-core.test.ts`
- Modify: `lib/branch-service.ts`
- Modify: `lib/rbac.ts`
- Modify: `lib/rbac.test.ts`

**Interfaces:**
- Produces: `getOptionalSession(): Promise<AuthenticatedStaff | null>`
- Produces: `requireSession(options: { allowPasswordChange: boolean }): Promise<AuthenticatedStaff>`
- Produces: `requireFullSession(): Promise<AuthenticatedStaff>`
- Produces: `validateStoredSession(row: StoredSessionRow, now: Date): AuthenticatedStaff`
- Produces: `shouldTouchSession(lastSeenAt: Date, now: Date): boolean`
- Changes: `getStaffContext()` derives current Staff only from authoritative session

- [ ] **Step 1: Write RED session validation tests**

Cover valid session, token-hash mismatch, revoked, absolute expired, idle expired, inactive Staff, stale role/branch claims and touch only after 5 minutes.

```ts
const now = new Date("2026-08-10T04:30:00.000Z");
const validFixture: StoredSessionRow = {
  staffId: 1,
  role: "OWNER",
  homeBranchId: 1,
  staffStatus: "ACTIVE",
  mode: "FULL",
  revokedAt: null,
  absoluteExpiresAt: new Date("2026-08-10T12:00:00.000Z"),
  idleExpiresAt: new Date("2026-08-10T05:00:00.000Z"),
  lastSeenAt: new Date("2026-08-10T04:26:00.000Z"),
};
expect(validateStoredSession(validFixture, now)).toMatchObject({ staffId: 1, role: "OWNER" });
expect(() => validateStoredSession({ ...validFixture, revokedAt: now }, now)).toThrow();
expect(shouldTouchSession(new Date(now.getTime() - 4 * 60_000), now)).toBe(false);
expect(shouldTouchSession(new Date(now.getTime() - 5 * 60_000), now)).toBe(true);
```

- [ ] **Step 2: Implement authoritative session validation**

Read cookie through `cookies()`, verify signature, hash session ID, join session with active Staff/branch, compare claims to DB and update activity at most every 5 minutes. Expired rows get `revoked_reason=EXPIRED` and `SESSION_EXPIRED` audit when actor is known.

- [ ] **Step 3: Replace Staff Switcher fallback semantics**

Delete Owner fallback from `resolveStaffSelection`; `getStaffContext` consumes `requireFullSession()` and returns the same DTO shape expected by Sidebar/services without `availableStaff` unless dev switcher is explicitly enabled.

- [ ] **Step 4: Add RBAC security permissions**

Add `auth.security.read` and `auth.security.manage` to Owner/Manager only and test Manager branch boundary plus Owner global access.

- [ ] **Step 5: Run focused regression and commit**

Run: `npx vitest run lib/auth/session-service.test.ts lib/staff-context-core.test.ts lib/rbac.test.ts`  
Expected: PASS

```powershell
git add lib/auth lib/staff-service.ts lib/staff-context-core.ts lib/staff-context-core.test.ts lib/branch-service.ts lib/rbac.ts lib/rbac.test.ts
git commit -m "feat: connect authenticated sessions to staff rbac"
```

### Task 5: Auth routes, Proxy และ protected application layout

**Files:**
- Create: `lib/auth/route-policy.ts`
- Create: `lib/auth/route-policy.test.ts`
- Create: `proxy.ts`
- Create: `proxy.test.ts`
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/logout/route.ts`
- Create: `app/api/auth/change-password/route.ts`
- Create: `app/api/auth/auth-routes.test.ts`
- Create: `app/(protected)/layout.tsx`
- Modify: `app/layout.tsx`
- Move: `app/page.tsx` → `app/(protected)/page.tsx`
- Move: `app/access` → `app/(protected)/access`
- Move: `app/accounting` → `app/(protected)/accounting`
- Move: `app/classes` → `app/(protected)/classes`
- Move: `app/crm` → `app/(protected)/crm`
- Move: `app/equipment` → `app/(protected)/equipment`
- Move: `app/lockers` → `app/(protected)/lockers`
- Move: `app/members` → `app/(protected)/members`
- Move: `app/payments` → `app/(protected)/payments`
- Move: `app/personal-training` → `app/(protected)/personal-training`
- Move: `app/reports` → `app/(protected)/reports`
- Move: `app/settings` → `app/(protected)/settings`

**Interfaces:**
- Produces: `decideRouteAccess(pathname, claims): RouteDecision`
- Consumes: `login`, `logout`, `requireFullSession`, request security and session claims

- [ ] **Step 1: Write RED route-policy tests**

```ts
expect(decideRouteAccess("/settings/security", ownerClaims)).toEqual({ type: "ALLOW" });
expect(decideRouteAccess("/settings/security", counterClaims)).toEqual({ type: "FORBIDDEN" });
expect(decideRouteAccess("/members", null)).toEqual({ type: "LOGIN" });
expect(decideRouteAccess("/members", passwordChangeClaims)).toEqual({ type: "CHANGE_PASSWORD" });
```

- [ ] **Step 2: Implement policy map and Proxy**

Map page prefixes to existing/new permissions, verify signed claims without DB query, build safe `returnTo`, exclude static assets, and return JSON 401 only for unauthenticated protected API paths. Auth APIs and public auth pages must not loop.

- [ ] **Step 3: Write RED route handler tests**

Mock auth service and assert Login cookie flags exactly:

```ts
expect(setCookie).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 28800 });
expect(loginErrorResponse("RATE_LIMITED").status).toBe(429);
```

- [ ] **Step 4: Implement auth Route Handlers**

Use Zod, `assertTrustedOrigin`, generic Thai error copy, `Retry-After` without account-specific unlock time, server-side safe return path and cookie set/delete only in handlers.

- [ ] **Step 5: Split global and protected layouts**

Keep font/theme/metadata in root layout. Put session validation, branch context, Sidebar and `main-content` in `(protected)/layout.tsx`. `/login` and `/change-password` must render without Sidebar.

- [ ] **Step 6: Run focused tests/build routes and commit**

Run: `npx vitest run lib/auth/route-policy.test.ts proxy.test.ts app/api/auth/auth-routes.test.ts`  
Run: `npx tsc --noEmit`  
Expected: PASS and no duplicate route error

```powershell
git add proxy.ts proxy.test.ts app lib/auth/route-policy.ts lib/auth/route-policy.test.ts
git commit -m "feat: protect application routes with authenticated sessions"
```

### Task 6: Login, Logout และ forced-password UI

**Files:**
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/change-password/page.tsx`
- Create: `components/auth/login-form.tsx`
- Create: `components/auth/login-form.test.tsx`
- Create: `components/auth/change-password-form.tsx`
- Create: `components/auth/change-password-form.test.tsx`
- Create: `components/auth/current-staff-menu.tsx`
- Create: `components/auth/current-staff-menu.test.tsx`
- Create: `components/sidebar.test.tsx`
- Modify: `components/sidebar.tsx`
- Modify: `components/staff-switcher.tsx`

**Interfaces:**
- Login POST body: `{ staffCode: string; password: string; returnTo: string }`
- Change password POST body: `{ password: string; confirmation: string }`
- Logout POST has no credential body

- [ ] **Step 1: Load UI guidance and write RED accessibility tests**

Use `ui-skills-root`, then `ui-ux-pro-max`, then test:

```tsx
expect(screen.getByRole("heading", { name: "เข้าสู่ระบบ" })).toBeVisible();
expect(screen.getByLabelText("รหัสพนักงาน")).toHaveAttribute("autocomplete", "username");
expect(screen.getByLabelText("รหัสผ่าน")).toHaveAttribute("autocomplete", "current-password");
expect(screen.getByRole("status")).toBeInTheDocument();
```

- [ ] **Step 2: Implement Login page/form**

Use existing tokens/components, visible show/hide control, disabled pending state, generic `aria-live` error, dark mode and safe hidden/prop `returnTo`. Do not store password beyond component state needed for submit.

- [ ] **Step 3: Implement Change Password page/form**

Show all four policy rules, confirmation mismatch, `autocomplete="new-password"`, Logout escape and redirect after FULL session is issued.

- [ ] **Step 4: Replace normal Staff Switcher with current Staff/Logout**

Sidebar displays name, code, role, branch and Logout. Render dev switcher only when server-provided `devSwitcherEnabled` is true and add a visible “โหมดจำลอง Development” warning.

- [ ] **Step 5: Run component tests and commit**

Run: `npx vitest run components/auth components/staff-switcher`  
Expected: PASS in light/dark-neutral token assertions and keyboard interactions

```powershell
git add app/\(auth\) components/auth components/sidebar.tsx components/staff-switcher.tsx
git commit -m "feat: add login logout and password change ui"
```

### Task 7: Staff password provisioning, reset และ Owner bootstrap

**Files:**
- Modify: `lib/staff-validation.ts`
- Modify: `lib/staff-service.ts`
- Modify: `app/api/staff/route.ts`
- Modify: `app/api/staff/[id]/route.ts`
- Create: `app/api/staff/[id]/reset-password/route.ts`
- Modify: `components/staff/staff-manager.tsx`
- Modify: `components/staff/staff-manager.test.tsx`
- Create: `lib/auth/password-lifecycle.test.ts`
- Create: `scripts/bootstrap-owner.ts`
- Create: `scripts/bootstrap-owner.test.ts`

**Interfaces:**
- Staff create adds `temporaryPassword`, `passwordConfirmation`
- Produces: `resetStaffPassword(actor, targetStaffId, temporaryPassword): Promise<void>`
- Produces: `changeOwnPassword(session, password): Promise<SessionCookieResult>`

- [ ] **Step 1: Write RED lifecycle tests**

```ts
it("Manager cannot reset Owner or staff outside home branch", async () => {
  await expect(resetStaffPassword(manager, owner.id, validPassword)).rejects.toMatchObject({ status: 403 });
  await expect(resetStaffPassword(manager, otherBranchStaff.id, validPassword)).rejects.toMatchObject({ status: 403 });
});

it("reset hashes password, marks forced change, revokes sessions and audits atomically", async () => {
  await resetStaffPassword(owner, counter.id, validPassword);
  expect(repo.staffUpdate.mustChangePassword).toBe(true);
  expect(repo.revokedReasons).toEqual(["PASSWORD_RESET"]);
});
```

- [ ] **Step 2: Implement Staff create/reset transaction**

Hash before insert/update, omit password fields from DTO, revoke target sessions on role/branch/status/password changes, and write `PASSWORD_RESET`/existing Staff audit in the same transaction.

- [ ] **Step 3: Extend Staff UI with temporary password dialogs**

Create form requires password+confirmation. Edit form keeps password absent. Add separate Reset Password confirmation dialog with target name and clear field state on close.

- [ ] **Step 4: Write RED bootstrap tests**

Test missing env, weak password, non-Owner target prevention, refusal to overwrite without `BOOTSTRAP_OWNER_ROTATE=true`, rotation revocation and output redaction.

- [ ] **Step 5: Implement bootstrap script**

Use `BOOTSTRAP_OWNER_PASSWORD`; query only `OWNER001`; set permanent hash and `must_change_password=false`; rotate only with explicit flag; never print secret/hash.

- [ ] **Step 6: Run lifecycle/UI/script tests and commit**

Run: `npx vitest run lib/auth/password-lifecycle.test.ts components/staff/staff-manager.test.tsx scripts/bootstrap-owner.test.ts`  
Expected: PASS

```powershell
git add lib/staff-validation.ts lib/staff-service.ts app/api/staff components/staff scripts package.json
git commit -m "feat: add staff password lifecycle and owner bootstrap"
```

### Task 8: Admin Security backend

**Files:**
- Create: `lib/auth/security-service.ts`
- Create: `lib/auth/security-service.test.ts`
- Create: `app/api/security/route.ts`
- Create: `app/api/security/sessions/[id]/revoke/route.ts`
- Create: `app/api/security/staff/[id]/revoke/route.ts`
- Create: `app/api/security/rate-limits/[id]/clear/route.ts`
- Create: `app/api/security/security-routes.test.ts`
- Modify: `lib/audit-service.ts`
- Modify: `lib/audit-policy.ts`
- Modify: `lib/audit-policy.test.ts`

**Interfaces:**
- Produces: `getSecurityDashboard(actor, filters): Promise<SecurityDashboard>`
- Produces: `revokeSecuritySession(actor, sessionId): Promise<void>`
- Produces: `revokeStaffSessions(actor, staffId): Promise<void>`
- Produces: `clearLoginLimit(actor, limitId): Promise<void>`

- [ ] **Step 1: Write RED visibility/management tests**

```ts
const owner: ActorContext = { staffId: 1, role: "OWNER", homeBranchId: 1 };
const manager: ActorContext = { staffId: 2, role: "MANAGER", homeBranchId: 2 };
const filters: SecurityFilters = { page: 1, pageSize: 20 };
const ownerResult = await getSecurityDashboard(owner, filters);
const managerResult = await getSecurityDashboard(manager, filters);
expect(ownerResult.events.rows.some((row) => row.actorStaffId === null)).toBe(true);
expect(managerResult.sessions.rows.every((row) => row.homeBranchId === 2)).toBe(true);
await expect(clearLoginLimit(manager, unknownIpLimit.id)).rejects.toMatchObject({ status: 403 });
await expect(revokeStaffSessions(manager, owner.id)).rejects.toMatchObject({ status: 403 });
```

- [ ] **Step 2: Implement paginated security queries**

Return separate `sessions`, `limits`, `events` pagination blocks. Derive session status in SQL/service, truncate fingerprint for DTO, never select token hash, and left join nullable audit actor/branch.

- [ ] **Step 3: Implement revoke/unlock mutations**

Check `auth.security.manage`, reuse `canManageStaff`, make operations idempotent, and write `SESSION_REVOKED` or `AUTH_RATE_LIMIT_CLEARED` with allowlisted metadata.

- [ ] **Step 4: Add Route Handlers and error mapping**

Validate IDs/filter dates/page sizes with Zod, require FULL session, return 401/403/404/409 consistently and apply Origin validation to POST mutations.

- [ ] **Step 5: Run backend tests and commit**

Run: `npx vitest run lib/auth/security-service.test.ts lib/audit-policy.test.ts app/api/security/security-routes.test.ts`  
Expected: PASS

```powershell
git add lib/auth/security-service.ts lib/auth/security-service.test.ts lib/audit-service.ts lib/audit-policy.ts lib/audit-policy.test.ts app/api/security
git commit -m "feat: add admin authentication security api"
```

### Task 9: Admin Security page

**Files:**
- Create: `app/(protected)/settings/security/page.tsx`
- Create: `components/security/security-console.tsx`
- Create: `components/security/security-console.test.tsx`
- Modify: `components/sidebar.tsx`

**Interfaces:**
- Consumes: `SecurityDashboard` and security mutation endpoints from Task 8
- Route permission: `auth.security.read`

- [ ] **Step 1: Load UI guidance and write RED UI tests**

```tsx
const rawSessionToken = "raw-session-token-must-never-render";
const rawIpAddress = "203.0.113.24";
expect(screen.getByRole("tab", { name: "เซสชัน" })).toBeVisible();
expect(screen.getByRole("tab", { name: "Rate limit" })).toBeVisible();
expect(screen.getByRole("tab", { name: "เหตุการณ์ Login" })).toBeVisible();
expect(screen.queryByText(rawSessionToken)).not.toBeInTheDocument();
expect(screen.queryByText(rawIpAddress)).not.toBeInTheDocument();
```

- [ ] **Step 2: Implement Sessions tab**

Responsive table/cards show Staff/role/branch/status/Login/last activity/expiry/device category and confirmation dialogs for revoke one/all. Keep filter/pagination in URL search params.

- [ ] **Step 3: Implement Rate Limits and Login Events tabs**

Show truncated fingerprint, scope/count/window/locked-until, Owner/Manager scoped actions, audit filters and manual refresh. Unknown actor copy is “ไม่ทราบบัญชี”.

- [ ] **Step 4: Add navigation and permission filtering**

Add `/settings/security` menu item visible only with `auth.security.read`; preserve existing active-route behavior.

- [ ] **Step 5: Run UI tests and commit**

Run: `npx vitest run components/security/security-console.test.tsx components/sidebar.test.tsx`  
Expected: PASS including focus restoration and disabled pending actions

```powershell
git add app/\(protected\)/settings/security components/security components/sidebar.tsx
git commit -m "feat: add authentication security dashboard"
```

### Task 10: Authoritative protection inventory และ development switcher lockdown

**Files:**
- Create: `lib/auth/protected-route-inventory.test.ts`
- Modify: every exported method in `app/api/**/route.ts` lacking `requirePermission` or `requireSession`
- Modify: `app/api/staff/select/route.ts`
- Modify: `lib/staff-service.ts`
- Modify: `lib/audit-service.ts`
- Modify: `app/(protected)/settings/audit/page.tsx`
- Modify: `components/audit/audit-explorer.tsx`

**Interfaces:**
- All non-auth Route Handlers have authoritative session/RBAC check in the handler or called service
- Dev switch endpoint returns 404 unless both development conditions are true

- [ ] **Step 1: Write RED inventory test**

Read every `app/api/**/route.ts`, exclude `app/api/auth/**`, and fail when an exported HTTP method has neither a direct guard nor an allowlisted guarded service. Initial explicit gaps include Dashboard, Accounting, Accounting Export, Members GET/Next Code, Branch Select, Staff Select and any GET in mixed-method files whose guard exists only in POST.

```ts
expect(unprotectedMethods).toEqual([]);
```

- [ ] **Step 2: Add least-privilege guards to each gap**

Use the permission that matches the existing sidebar/module: dashboard requires FULL session; members/next-code use `members.manage`; accounting/export use `accounting.manage`; branch select requires FULL session and returns only allowed branches; every mixed GET uses its module permission.

- [ ] **Step 3: Lock development switcher**

Check environment before parsing body, require FULL authenticated session, return 404 in production/without opt-in, rotate session claims for selected Staff only in development and write `DEV_STAFF_CONTEXT_CHANGED`.

- [ ] **Step 4: Support nullable auth audit rows in existing Audit UI**

Use left joins, display unknown actor/branch safely, restrict null-branch events to Owner, and keep Manager queries scoped to home branch.

- [ ] **Step 5: Run inventory/regression tests and commit**

Run: `npx vitest run lib/auth/protected-route-inventory.test.ts lib/audit-policy.test.ts`  
Run: `npx tsc --noEmit`  
Expected: PASS with empty unprotected method list

```powershell
git add app/api lib components/audit app/\(protected\)/settings/audit
git commit -m "fix: enforce session checks across protected routes"
```

### Task 11: Migration, end-to-end verification และ delivery

**Files:**
- Create: `.env.example`
- Modify: `README.md`
- Create: `docs/superpowers/reports/2026-08-10-login-session-security-report.md`

**Interfaces:**
- Documents exact bootstrap/deployment variables without real secret values
- Produces final verification evidence and known warnings

- [ ] **Step 1: Document environment and run full automated suite**

Document:

```dotenv
AUTH_SESSION_SECRET=<at-least-32-random-bytes>
AUTH_FINGERPRINT_SECRET=<different-at-least-32-random-bytes>
APP_ORIGIN=http://localhost:3005
TRUST_PROXY=false
ENABLE_DEV_STAFF_SWITCHER=false
BOOTSTRAP_OWNER_PASSWORD=<set-only-while-running-bootstrap>
```

Run in order:

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

Expected: 0 test/type/build/lint errors; record existing unrelated warnings verbatim

- [ ] **Step 2: Apply migration and verify schema/data**

Run: `npx drizzle-kit migrate`  
Verify read-only: auth tables/indexes exist, nullable audit actor/branch applied, Staff rows/members/payments counts unchanged, `OWNER001` exists once and no plaintext/hash is printed.

- [ ] **Step 3: Bootstrap Owner securely**

Set `BOOTSTRAP_OWNER_PASSWORD` only in the current process, run `npm run auth:bootstrap-owner`, then clear the process variable. Verify Owner can Login and database stores an Argon2id hash without printing it.

- [ ] **Step 4: Browser QA on port 3005**

Start `npm run dev`, then verify:

1. unauthenticated protected route → Login with safe return path
2. wrong password 5 times → account rate limited and audit rows created
3. valid temporary Staff → forced Change Password only
4. Login/Logout cookie flags and session revoke
5. Counter cannot open Security; Manager sees own branch; Owner sees all/unknown events
6. revoke session and clear rate limit actions
7. dev switcher absent by default and production endpoint unavailable
8. Login, Change Password and Security in light/dark, desktop/mobile, keyboard; console/server logs contain no credential/token

- [ ] **Step 5: Write report and final commit**

Report exact commands, exit codes, migration verification, QA routes, cookie flag evidence, audit evidence, warnings and unresolved risks.

```powershell
git add .env.example README.md docs/superpowers/reports/2026-08-10-login-session-security-report.md
git commit -m "docs: record login session security verification"
```

- [ ] **Step 6: Finish branch**

Use `superpowers:verification-before-completion`, then `superpowers:requesting-code-review`, address findings with focused regression tests, and finally use `superpowers:finishing-a-development-branch` to offer merge/push options. Do not claim completion without fresh suite evidence from final HEAD.
