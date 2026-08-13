# Login and session security verification report

Date: 2026-08-13

Branch: `codex/login-session-security`

Verification port: `3005`

## Scope and secret-handling controls

- The worktree was clean at preflight and pointed to the expected branch.
- No `.env` file was present in the worktree. For the approved migration only, `DATABASE_URL` was loaded from the main repository's ignored `.env` into the current process without printing, copying, or persisting its value. `BOOTSTRAP_OWNER_PASSWORD` was absent.
- No password, hash, token, credential, raw IP address, or database URL was printed or written during this task.
- `.env.example` contains placeholders only. The README instructs operators to provide bootstrap credentials only to the current secure process and clear them immediately.

## Automated verification

| Command | Exit | Evidence |
| --- | ---: | --- |
| `npm test` | 1 | PowerShell blocked `npm.ps1` before project code ran because script execution is disabled. |
| `npm.cmd test` | 1 | 48/49 files and 284/285 tests passed. `components/staff/staff-manager.test.tsx:77` exceeded Vitest's 5-second per-test timeout during the full parallel run. |
| `.\node_modules\.bin\vitest.cmd run components/staff/staff-manager.test.tsx` | 0 | Focused reproduction passed 5/5 tests. |
| `.\node_modules\.bin\vitest.cmd run components/staff/staff-manager.test.tsx --reporter=verbose` | 0 | Focused reproduction passed 5/5; the previously timed-out test completed in 1.544 seconds. This indicates full-suite load sensitivity rather than a deterministic assertion failure. |
| `npx.cmd tsc --noEmit` | 0 | TypeScript emitted no diagnostics. |
| `.\node_modules\.bin\vitest.cmd run` | 0 | Fresh complete rerun passed 49/49 files and 285/285 tests in 59.17 seconds. |
| `.\node_modules\.bin\eslint.cmd` | 0 | Fresh extended-cap run completed with 0 errors and 4 warnings. |
| `.\node_modules\.bin\next.cmd build` | 0 | After replacing the build-time Google font loader with the existing CSS sans-serif stack, the production build compiled in 35.1 seconds, completed TypeScript in 58 seconds, and generated 55/55 pages in 109.6 seconds. |
| `git diff --check` | 0 | No whitespace errors. Git warned that README LF will be replaced by CRLF in the working tree. |

The initial 60-second lint and build attempts were terminated with exit 124 and no verdict. The table records the later single fresh runs with realistic hard caps.

### Final HEAD verification

The following commands were run sequentially from `148dffe` with only this report modified:

| Command | Exit | Evidence |
| --- | ---: | --- |
| `.\node_modules\.bin\vitest.cmd run` | 1 | The first run passed 49/50 files and 286/287 tests; only the bootstrap CLI subprocess test exceeded Vitest's 5-second timeout under full-suite load. |
| `.\node_modules\.bin\vitest.cmd run scripts/bootstrap-owner.test.ts --reporter=verbose` | 0 | Focused bootstrap verification passed 10/10 tests; the subprocess test completed in 2.596 seconds. No code change was made. |
| `.\node_modules\.bin\vitest.cmd run` | 0 | Fresh complete rerun passed 50/50 files and 287/287 tests in 59.04 seconds. |
| `.\node_modules\.bin\tsc.cmd --noEmit` | 0 | TypeScript emitted no diagnostics. |
| `.\node_modules\.bin\eslint.cmd .` | 0 | Full lint completed with 0 errors and the same 4 warnings recorded below. |
| `.\node_modules\.bin\next.cmd build` | 0 | Next.js 16.2.11 compiled successfully, completed TypeScript, and generated 55/55 pages. |

The one initial test timeout was load-sensitive: the focused reproduction and subsequent full rerun both passed without a production or test change.

### Warnings recorded verbatim

```text
components/access/scan-page.tsx:113:17  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element
components/members/member-detail.tsx:148:15  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element
db/schema/member-packages.ts:1:33  warning  'datetime' is defined but never used  @typescript-eslint/no-unused-vars
db/schema/members.ts:1:43  warning  'datetime' is defined but never used  @typescript-eslint/no-unused-vars
```

Next.js build warning:

```text
Warning: Next.js inferred your workspace root, but it may not be correct.
We detected multiple lockfiles and selected D:\Project\nextjs\fitness-management\package-lock.json as the root directory.
Detected additional lockfile: D:\Project\nextjs\fitness-management\.worktrees\login-session-security\package-lock.json
```

The deterministic font regression `app/layout.test.ts` was developed with a verified RED/GREEN cycle. Before the layout edit it failed because `app/layout.tsx` imported `next/font/google`; after the surgical edit it passed 1/1 tests. The existing CSS semantic stack remains `"Inter", sans-serif`, so the build no longer needs a Google Fonts network request.

## Migration and database verification

The approved database target was identified safely as a connected MySQL schema without printing or recording its URL, host, database name, user, or credentials. Read-only preflight recorded only aggregate evidence: 10 migration journal entries with `0009` as the latest migration, Staff/member/payment counts of 1/3/2, and exactly one binary-exact `OWNER001`. Both auth tables were absent and both audit actor/branch columns were non-nullable before migration.

`npx drizzle-kit migrate` was started with `DATABASE_URL` passed only through the child-process environment. The CLI emitted no completion output and required termination after 180 seconds. Read-only post-state verification nevertheless confirmed that the migration completed: the journal contains 11 entries with `0010_auth_sessions` latest; `auth_sessions` and `auth_login_limits` exist; `audit_logs.branch_id` and `audit_logs.actor_staff_id` are nullable; and all four required indexes exist (`auth_session_token_hash_unique`, `auth_session_staff_status_expiry_idx`, `auth_limit_scope_subject_unique`, and `auth_limit_scope_locked_until_idx`).

Post-migration Staff/member/payment counts remained 1/3/2 and binary-exact `OWNER001` remained exactly one, matching the preflight baselines. No rows, names, passwords, hashes, URLs, hosts, users, or credentials were printed or recorded.

## Owner bootstrap

Owner bootstrap completed successfully against the verified `OWNER001` record. Aggregate postconditions confirmed exactly one binary-exact Owner, an Argon2id password hash, `must_change_password = false`, no active unrevoked Owner session after rotation, and one successful latest `PASSWORD_RESET` bootstrap audit with a null actor and the Owner's branch. No password, hash, session identifier, or row data was printed or recorded.

`BOOTSTRAP_OWNER_PASSWORD` was removed from the ignored runtime environment after bootstrap and is absent from the current process. The bootstrap implementation is covered by focused tests for missing/weak passwords, exact Owner matching, explicit rotation, transactional revocation/audit behavior, rollback, and CLI environment propagation.

## Browser QA

Public browser QA was run on port `3005`, after which the development server was stopped and the port was confirmed free. The unauthenticated `/settings/security` request redirected to Login with a safe local return path, `/change-password` redirected unauthenticated users to Login, and the forbidden page rendered correctly. Login was checked in light and dark mode and at a 375-by-812 mobile viewport without horizontal overflow. The browser console contained no warnings or errors.

Owner Login was exercised while diagnosing an observed first-login redirect back to Login. Database aggregate evidence showed that the successful request created a `FULL` session and a successful `LOGIN_SUCCESS` audit, and that the session was neither immediately revoked nor expired. The Login form now performs a full document navigation after the Route Handler rotates the cookie so the next protected request reads the new cookie. The focused regression suite passed after a verified RED/GREEN cycle, and review of `f278e2e..148dffe` found no remaining issue.

The follow-up manual browser result was not clear enough to establish that the first-login bounce is fixed end to end. The user approved proceeding with the unit/integration/review evidence and revisiting the issue if it recurs. Browser E2E is therefore **not** recorded as passed.

The following port `3005` checks remain pending:

1. five wrong-password attempts, account limiting, audit creation, and the destructive rate-limit-clear action;
2. temporary Staff forced-password-change flow;
3. Counter and Manager Security visibility boundaries and a complete Owner visibility pass;
4. destructive session-revoke action;
5. authenticated Change Password and Security flows in light/dark, desktop/mobile, and keyboard modes.

Only the Owner account existed for this QA. No Counter, Manager, or temporary Staff account was provisioned, and destructive rate-limit/session tests were not executed. Public unauthenticated QA remains valid. The development server was stopped after QA and port `3005` was confirmed free again during finalization.

## Warnings and unresolved risks

- The initial full suite had one load-sensitive timeout; two focused runs and the fresh complete 285-test rerun passed without any code change.
- Next.js warned that multiple lockfiles caused it to infer `D:\Project\nextjs\fitness-management` as the workspace root and also detected the worktree lockfile.
- Production typography now uses the existing CSS `"Inter", sans-serif` stack without a build-time Google Fonts request. Environments without a locally installed Inter font render their system sans-serif fallback.
- The Drizzle migration CLI did not exit on its own and had to be terminated after 180 seconds, although aggregate read-only post-state verification proved that `0010_auth_sessions` was fully applied. Operators should investigate why the CLI retained the process after successful migration.
- The login-bounce change has unit/integration and clean review evidence, but its manual browser result remains inconclusive; revisit it if the symptom recurs.
- Counter, Manager, temporary Staff, rate-limit, and destructive session scenarios remain unexecuted because only the Owner account existed for QA.

## Task 11: first-login bounce diagnosis and fix

The first Login request returned HTTP 200 and created a `FULL` session plus a successful `LOGIN_SUCCESS` audit. The session remained active and was not revoked. The immediately following protected render nevertheless raised an unauthenticated authorization error and returned the browser to Login. Later Login attempts remained active or were revoked by a normal Logout. These aggregate results rule out failed session persistence, immediate revocation, expiry, and duplicate-login invalidation as causes of the observed bounce.

The Login form used App Router `router.replace()` immediately after the Route Handler set the session cookie. The protected transition could therefore consume client-router/RSC state that did not reliably observe the newly rotated cookie. The fix replaces that soft navigation with `globalThis.location.replace()` using the same server-sanitized relative return path. A full document request carries the new cookie while preserving replace-history behavior.

The regression was developed with a verified RED/GREEN cycle. Before the production edit, the focused Login form suite failed 1/7 because hard navigation was never called. After the edit, the focused suite passed 7/7. Unit/integration evidence, the aggregate session/audit evidence above, and a clean review support the change. The manual browser result remains inconclusive and is not claimed as passing E2E evidence.

No browser cookies, browser storage, passwords, token values, session IDs, hashes, staff data, database connection details, or raw IP addresses were inspected or recorded. Database diagnostics reported aggregate booleans and counts only.
