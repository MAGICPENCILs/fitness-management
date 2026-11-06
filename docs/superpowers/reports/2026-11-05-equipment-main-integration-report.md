# Equipment Main Integration: Code Verification

Verified on 2026-11-06 (Asia/Bangkok), Task 3 only.

## Scope and revision

- Branch: `codex/equipment-production-ready`.
- Integrated source under review: `81922dca5199af2ac7f1d424202195558217eb9a`.
- Current local `main` and merge base: `65429102df0d701192a0bdf9e1a6345823afcdc1`.
- Review range: `65429102df0d701192a0bdf9e1a6345823afcdc1...81922dca5199af2ac7f1d424202195558217eb9a` (51 changed files before this report).
- Worktree: `D:/Project/nextjs/fitness-management/.worktrees/equipment-production-ready`; initially clean.
- Task 3 does not access live databases, environment files, credentials, production records, or the development server. No migration, backup, runtime mutation, merge, push, or dependency change is authorized by this report.

## Fresh automated verification

Commands below were run sequentially in the worktree. Test counts are from this run, not earlier readiness reports. No heavy check ran alongside another heavy check.

| Command | Exact result |
| --- | --- |
| `npm test -- equipment rbac audit route-policy protected-route-inventory sidebar --maxWorkers=1 --pool=forks` | PASS, exit 0; 18 files, 232 tests; 87.99s. |
| `npm test -- --maxWorkers=1 --pool=forks` | PASS, exit 0; 82 files, 564 tests; 156.76s. |
| `npx tsc --noEmit --incremental false --pretty false` | PASS, exit 0; no diagnostics. |
| `npm run lint` | PASS with warnings, exit 0; 0 errors, 4 warnings (listed below). |
| `npm run build` | FAIL / environment-blocked, exit 1; SWC native load fails before compilation. Not a pass and not a timeout. |
| `npm run build` (after controller's isolated SWC binary repair) | FAIL, exit 1; native loading succeeds, but Turbopack stops with `Missing field additionalRoots`. No timeout. |
| `npm run build` (after controller's complete local dependency copy) | PASS, exit 0; Next/SWC 16.4.4, compiled in 94s, TypeScript in 87s, static generation 73/73 in 963ms, route generation and final optimization complete. |
| `npx drizzle-kit check` | PASS, exit 0; `Everything's fine`. Offline migration metadata only. |
| `git diff --check` | PASS, exit 0; no output. |
| `git diff --check main...HEAD` (additional branch-wide check) | FAIL, exit 1; old equipment design whitespace at lines 3, 4, 450. |

No verification command timed out or was cancelled. No load-sensitive failure required a focused rerun, and the full-suite status remains PASS for this exact run.

### Existing lint warnings

- `components/access/scan-page.tsx:153:17`: `@next/next/no-img-element`.
- `components/members/member-detail.tsx:149:15`: `@next/next/no-img-element`.
- `db/schema/member-packages.ts:1:33`: unused `datetime` import.
- `db/schema/members.ts:1:43`: unused `datetime` import.

All four files are unchanged versus main. They were recorded without unrelated edits.

### Build blocker and nonzero outcomes

The initial build printed that `@next/swc-win32-x64-msvc/next-swc.win32-x64-msvc.node` is not a valid Win32 application, that `@next/swc-wasm-nodejs` and `@next/swc-wasm-web` are not installed, and that SWC/`next.config.ts` could not load. It exited 1 before application compilation; production output and prerendering were not verified by that attempt.

Minimal independent reproduction:

```powershell
node -e "console.log('Node platform/arch:',process.platform,process.arch);try{require('@next/swc-win32-x64-msvc');console.log('SWC native load passed')}catch(e){console.error('SWC native load failed:',e.code);process.exitCode=1}"
```

Result: exit 1, `Node platform/arch: win32 x64`, `SWC native load failed: ERR_DLOPEN_FAILED`. `git diff --quiet main...HEAD -- package.json package-lock.json next.config.ts` exited 0: these inputs are unchanged from main. This established an installed native-runtime blocker, not a demonstrated equipment source defect. The initial pass did not attempt an elevated build retry or dependency installation.

The controller subsequently replaced only the isolated worktree's corrupted SWC native binary with the known-good binary from main's `node_modules`. Controller-provided evidence: matching SHA-256 (reported digest prefix/suffix `F97A38E...A367A`), length 110,266,368 bytes, and a direct native `require` probe exiting 0. The implementer did not independently rerun that probe or change source/package files.

The first authorized build-only rerun still exited 1 (approximately 5.1s). The SWC loader failure disappeared, Next.js reported `16.2.11 (Turbopack)`, and compilation started with `Creating an optimized production build ...` before failing with `Error: Missing field additionalRoots`. It also warned that multiple lockfiles caused the workspace root to be inferred as `D:/Project/nextjs/fitness-management`, with the worktree lockfile listed as an additional lockfile. The manifest declares Next.js `16.4.4`; the differing CLI version was recorded rather than attributed to an unproven source defect.

The controller then replaced the entire isolated worktree `node_modules` from the known-good main `node_modules` using a completed local multi-threaded copy (Robocopy), without changing source, manifests or lockfiles. This operational repair provenance is controller-reported. The implementer independently verified installed package versions with:

```powershell
node -e "console.log('next:',require('next/package.json').version);console.log('swc:',require('@next/swc-win32-x64-msvc/package.json').version)"
```

Result: exit 0, `next: 16.4.4`, `swc: 16.4.4`. The subsequent `npm run build` passed with exit 0: configuration loaded in 5.4s, compilation in 94s, TypeScript in 87s, static generation 73/73 in 963ms, then final page optimization and complete route output. The output includes `/equipment`, `/api/equipment`, `/api/equipment/[id]`, `/api/equipment/[id]/maintenance`, `/api/equipment/[id]/retire` and Proxy. No invalid-native, `additionalRoots` or multiple-lockfile warning appeared in this successful run. No network dependency installation or source/config workaround was performed by the implementer.

The final build result supersedes the build acceptance blocker, but does not erase the two earlier failed attempts. Only package-version verification and the build were rerun after the full dependency copy; focused/full tests, standalone typecheck, lint and Drizzle results above belong to the original sequential run. Live DB/runtime/browser acceptance remains unverified.

The branch-wide whitespace failure is confined to `docs/superpowers/specs/2026-08-21-equipment-production-ready-design.md`: trailing whitespace at lines 3 and 4, and an added blank line at EOF at line 450. This matches the older readiness report and was not introduced by Task 3. The plain working-tree check passing does not mean the branch-wide check passed.

## Whole-branch code review

What this change does: adds branch-scoped equipment registration, read-only access for Counter/Trainer, management for Owner/Manager, maintenance history, versioned lifecycle changes, retirement, and paginated responsive views. It integrates those features with current authentication, route policies, auditing, workforce schema history, and migration `0017`.

The review traced the page and API inputs through authoritative branch/session/permission checks, validation, services, repository reads/writes, audited transactions, response handling, and the UI callers. It checked the changed RBAC, sidebar, route policy, audit policy, schema, migration, repository, service, route, component, and regression-test code, with the approved design as the contract. Expected load is the existing multi-user, multi-branch application, including simultaneous maintenance and equipment edits; no new workload assumptions were added.

- Security/RBAC: public health, member, authentication, and TOTP self-service policies from current main remain intact. Equipment page/sidebar use `equipment.read`. Mutations require `equipment.manage`, authoritative branch scope, trusted Origin before body parsing, and strict input schemas. Cross-branch entities are not returned. Global equipment-code conflicts return fixed messages rather than existing equipment data.
- Concurrency/audit: existing-row writes lock by equipment ID plus branch, compare the supplied version, perform compare-and-set, and require exactly one affected row. Maintenance insertion, equipment update, and SUCCESS audit share a transaction. Failed audit writes roll back business writes. Duplicate-code insertion races are normalized against the exact global unique constraint. Stale/failed requests cannot create a SUCCESS audit.
- Lifecycle: retirement preserves equipment and history; later mutations are rejected. Retired records are excluded from actionable maintenance SQL predicates and UI urgency. Completed maintenance updates meter and next schedule under the same versioned transaction.
- UI: fixed error copy, explicit stale-versus-code-conflict handling, single refresh without automatic mutation retry, permission-based controls, accessible dialog labels/live regions, semantic desktop tables, mobile lists, and URL-owned filter/pagination state are present. This is source/DOM-test review, not visual or authenticated browser acceptance.
- No deterministic integration defect was established during this review; no production code, tests, fixtures, interfaces, exports, manifests or lockfiles were changed by the implementer. The controller's isolated dependency-runtime repairs are documented above.

Review status: implementer whole-branch review completed; independent review remains a separate controller gate. This report alone does not claim production acceptance.

## Migration evidence (offline only)

- `0017_equipment_production_ready.sql` contains exactly seven operations: extend the status enum with `RETIRED`; add nullable `retired_at` and `retired_reason`; add non-null `version` default 1; add the three branch composite indexes. No destructive statement, table recreation, data rewrite, or unrelated SQL operation appears.
- The schema regression suite checks the complete seven-statement allowlist and MySQL identifier lengths, while preserving global unique equipment code.
- Offline Node inspection of tracked JSON confirmed the entire journal prefix through `0016` is unchanged from current main, snapshot `0017.prevId` equals `0016.id`, and only `equipment` changes semantically. `attendance_corrections` differs in JSON object-key ordering only, not schema meaning.
- Snapshot `equipment_code_unique` remains unique on `code` alone, not `(branch_id, code)`; existing single-column indexes remain alongside the new composite indexes.
- None of this proves actual database schema, row counts, defaults on existing rows, or MySQL DDL/locking behavior. Those require the approved database task.

## Remaining gates and known limits

1. Production build acceptance now passes after the local dependency-runtime repair. Decide separately whether the old design-document whitespace must be cleaned up before branch acceptance; the branch-wide diff check remains recorded as failing.
2. Complete the independent whole-branch review and close any Critical/Important findings before database work.
3. In a controlled write-free window, perform aggregate-only DB preflight, verify migration journal `0016`, and check schema/invariants without exposing row data. Create the encrypted backup and pass dry-run restore verification before DDL.
4. Apply `0017` once, then verify journal, enum/columns/indexes/defaults, invariant counts and unchanged business row counts. MySQL DDL auto-commits: a partial failure requires inspection and forward repair, never blind retry.
5. Run authorized runtime/browser tests on port 3005: all roles, branch isolation, duplicate/stale 409 responses, retirement/history, maintenance, pagination, light/dark/mobile layouts, keyboard and dialog focus. These were deliberately not run here.
6. Real MySQL transaction rollback, `SELECT ... FOR UPDATE`, generated maintenance SQL behavior and concurrent sessions remain externally unverified; repository tests use in-memory fakes and generated-query assertions.
7. Previously documented limits remain: dashboard out-of-range pagination is not normalized to the last page; repeated detail `historyPage` query parameters are resolved with `URLSearchParams.get()`; legacy indexes have ongoing storage/write cost. No restore-from-retirement or branch-transfer feature was added.

No environment files or credential values were read, logged, or changed. Hardware/provider acceptance and live production readiness are outside this code-verification task.

## Independent review fix round 1/5

Review/fix base: `d84de97`. The controller supplied four Important findings after the initial implementer review. The initial statement that no deterministic defect was established is historical; the following new regression tests reproduce and close these four cases.

1. Open equipment edit, operation, maintenance and retirement dialogs now capture their original item/version when opened. A prop refresh cannot attach a newer version to an older uncontrolled draft; meter validation uses the same captured meter. The next open captures the new item. Existing stale-conflict handling still refreshes once without retry.
2. Operational updates check the locked version before the monotonic-meter rule. A draft for 110 hours at version 3 against current 120/version 4 produces `STALE_VERSION`/409; a genuine decrease using version 4 remains 400. API regression tests exercise the real mutation service rather than faking the conflict.
3. Master interval updates distinguish omitted (leave unchanged), explicit `null` (clear interval plus hour threshold), and positive interval. Setting an interval when no hour threshold exists initializes it from locked current usage plus interval. An existing threshold is not shifted when editing interval. Blank create fields remain omitted; blank edit interval submits null. Create validation and positive bounds remain intact.
4. Equipment/history filter forms remount only when their applied filter values change, so Reset/client navigation updates displayed and submitted values without discarding a draft during an ordinary unchanged rerender. Regression tests cover both reset-to-default and navigation to another non-default filter set.

Scope: 13 source/test files, reusing existing refs, Zod schema, lock/CAS transaction and form markup. No dependency, SQL, schema, migration, route-handler implementation, RBAC, audit policy, DB, environment, server or browser change. Thai comments explain the changed business rules. The deferred retired-detail Minor was not addressed.

Focused RED/GREEN command:

```powershell
npm test -- lib/equipment-mutation-service.test.ts lib/equipment-repository.test.ts lib/equipment-core.test.ts app/api/equipment/equipment-routes.test.ts components/equipment/equipment-actions.test.tsx components/equipment/equipment-dashboard.test.tsx --maxWorkers=1 --pool=forks
```

| Check | Exact result |
| --- | --- |
| Focused RED, tests added before implementation | Exit 1, 6 files failed, 15 failed / 143 passed (158 total), 31.49s. Expected failures: live draft versions/validation, stale meter 400 instead of 409, missing interval/threshold coupling and null support, and stale filter controls. |
| Same focused command GREEN | Exit 0, 6 files / 158 tests passed, 27.18s. |
| `npm test -- --maxWorkers=1 --pool=forks` | Exit 0, 82 files / 582 tests passed, 171.77s. |
| `npx tsc --noEmit --incremental false --pretty false` | Exit 0; no diagnostics. |
| `npm run lint` | Exit 0; 0 errors, same 4 unrelated warnings listed above; no warning in changed files. |
| `npm run build` | Exit 0; Next.js 16.4.4, compiled in 13.3s, TypeScript in 12.1s, generated 73/73 static pages in 1257ms and finalized route optimization. |
| `npx drizzle-kit check` | Exit 0; `Everything's fine`; offline metadata only. |
| `git diff --check` | Exit 0; only LF/CRLF informational warnings. |
| `git diff --check main...HEAD` | Exit 1; same pre-existing old-design whitespace at lines 3, 4 and 450, not changed in this round. |

All heavy checks were sequential. Apart from the deliberate RED run and previously known branch-wide whitespace, there was no failed verification, timeout or cancellation in this fix round. The focused and full GREEN runs use the aligned dependencies documented above. Self-review traced every changed caller and verified that branch scope, lifecycle guards, input bounds, CAS, transactional audit behavior, fixed response handling, labels, focus restoration and pending guards remain in place. No shared abstraction or dependency was added. The four Important cases are implemented with regression evidence; controller/independent re-review remains the acceptance gate, and DB/browser checks remain outside scope.

## Task 4: live database backup, migration and postflight

Completed 2026-11-06 (Asia/Bangkok), against reviewed source `2472c95`. This section supersedes only the earlier pending live-DB gate; it does not claim runtime/browser acceptance. No product, schema, migration, dependency or environment file changed. Port 3005 had no listener initially, before migration and at handoff; the application remains stopped for Task 5.

Aggregate preflight passed: journal `0016_add_staff_workforce` / `1793712135432`, 17 entries and exactly one matching expected timestamp/local SQL digest (digest value not emitted); equipment 1, maintenance 1; binary/global duplicate-code groups 0/0. `retired_at`, `retired_reason`, `version` and all three new branch indexes were absent. Initial sandbox connectivity failed with safe `EACCES`; the approved internal-network escalation succeeded before mutation.

Invariant violation counts were all 0 before and after migration: warranty before purchase; current usage outside 0–10,000,000; non-null interval outside 1–1,000,000; non-null next-service threshold outside 0–11,000,000; completed maintenance missing completion date; completion before schedule; cost outside 0–99,999,999.99; non-null service usage outside 0–10,000,000.

The existing main backup service created ignored `backups/fitness-backup-20261106-085757.sql.enc` plus `.manifest.json`, labeled `0016_add_staff_workforce`, AES-256-GCM, 109,250 ciphertext bytes. Existing restore service dry-run passed manifest/checksum/authenticated-metadata/GCM/target checks and returned `restored: false`. No restore executor or plaintext restore artifact was used. Existing main `.env` and encryption key were loaded process-only without copying or printing their values. `git check-ignore` confirmed both artifacts remain ignored.

The standard reviewed worktree `node node_modules/drizzle-kit/bin.cjs migrate` exited 0 with no timeout after an immediately repeated guarded preflight. Postflight passed:

| Check | Exact result |
| --- | --- |
| Latest journal | `0017_equipment_production_ready` / `1793874445717`; 18 entries, exactly one expected timestamp/local SQL digest match |
| Business counts | Equipment 1, maintenance 1; unchanged |
| `status` | `enum('OPERATIONAL','MAINTENANCE','OUT_OF_SERVICE','RETIRED')`, NOT NULL, default `OPERATIONAL` |
| `retired_at` / `retired_reason` | `timestamp` / `varchar(500)`; both nullable, default NULL |
| `version` | `int`, NOT NULL, default 1; zero existing rows with a different version |
| Retirement data | Zero non-null dates and zero non-null reasons |
| `equipment_branch_status_idx` | Non-unique, ordered `branch_id`, `status` |
| `equipment_branch_category_idx` | Non-unique, ordered `branch_id`, `category` |
| `equipment_branch_maintenance_idx` | Non-unique, ordered `branch_id`, `next_maintenance_date` |
| Duplicate groups / invariant violations | 0 throughout |
| Second standard migrate command | Exit 0, no timeout; fresh postflight still 18 journal entries and unchanged 1/1 business counts; no pending work |

No partial DDL failure, blind retry, restore execution, seed, business-data mutation, server start, merge or push occurred. Raw rows, codes, serials, notes, PII, URLs, credentials, tokens and digest values were not emitted. Full operational evidence is in the ignored SDD `task-4-report.md`; only this report amendment is tracked. Dry-run integrity verification is not a disposable-server recovery drill; runtime/browser, concurrency and real transaction/locking acceptance remain Task 5 or separately authorized checks.
