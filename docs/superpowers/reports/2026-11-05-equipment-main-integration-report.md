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

The build printed that `@next/swc-win32-x64-msvc/next-swc.win32-x64-msvc.node` is not a valid Win32 application, that `@next/swc-wasm-nodejs` and `@next/swc-wasm-web` are not installed, and that SWC/`next.config.ts` could not load. It exited 1 before application compilation; therefore production output and prerendering remain unverified.

Minimal independent reproduction:

```powershell
node -e "console.log('Node platform/arch:',process.platform,process.arch);try{require('@next/swc-win32-x64-msvc');console.log('SWC native load passed')}catch(e){console.error('SWC native load failed:',e.code);process.exitCode=1}"
```

Result: exit 1, `Node platform/arch: win32 x64`, `SWC native load failed: ERR_DLOPEN_FAILED`. `git diff --quiet main...HEAD -- package.json package-lock.json next.config.ts` exited 0: these inputs are unchanged from main. This establishes an installed native-runtime blocker, not a demonstrated equipment source defect; the underlying binary damage/compatibility cause was not repaired or guessed. There was no elevated build retry or dependency installation.

The branch-wide whitespace failure is confined to `docs/superpowers/specs/2026-08-21-equipment-production-ready-design.md`: trailing whitespace at lines 3 and 4, and an added blank line at EOF at line 450. This matches the older readiness report and was not introduced by Task 3. The plain working-tree check passing does not mean the branch-wide check passed.

## Whole-branch code review

What this change does: adds branch-scoped equipment registration, read-only access for Counter/Trainer, management for Owner/Manager, maintenance history, versioned lifecycle changes, retirement, and paginated responsive views. It integrates those features with current authentication, route policies, auditing, workforce schema history, and migration `0017`.

The review traced the page and API inputs through authoritative branch/session/permission checks, validation, services, repository reads/writes, audited transactions, response handling, and the UI callers. It checked the changed RBAC, sidebar, route policy, audit policy, schema, migration, repository, service, route, component, and regression-test code, with the approved design as the contract. Expected load is the existing multi-user, multi-branch application, including simultaneous maintenance and equipment edits; no new workload assumptions were added.

- Security/RBAC: public health, member, authentication, and TOTP self-service policies from current main remain intact. Equipment page/sidebar use `equipment.read`. Mutations require `equipment.manage`, authoritative branch scope, trusted Origin before body parsing, and strict input schemas. Cross-branch entities are not returned. Global equipment-code conflicts return fixed messages rather than existing equipment data.
- Concurrency/audit: existing-row writes lock by equipment ID plus branch, compare the supplied version, perform compare-and-set, and require exactly one affected row. Maintenance insertion, equipment update, and SUCCESS audit share a transaction. Failed audit writes roll back business writes. Duplicate-code insertion races are normalized against the exact global unique constraint. Stale/failed requests cannot create a SUCCESS audit.
- Lifecycle: retirement preserves equipment and history; later mutations are rejected. Retired records are excluded from actionable maintenance SQL predicates and UI urgency. Completed maintenance updates meter and next schedule under the same versioned transaction.
- UI: fixed error copy, explicit stale-versus-code-conflict handling, single refresh without automatic mutation retry, permission-based controls, accessible dialog labels/live regions, semantic desktop tables, mobile lists, and URL-owned filter/pagination state are present. This is source/DOM-test review, not visual or authenticated browser acceptance.
- No deterministic integration defect was established during this review; no production code, tests, fixtures, interfaces, exports, or dependencies were changed by Task 3.

Review status: implementer whole-branch review completed; independent review remains a separate controller gate. This report alone does not claim production acceptance.

## Migration evidence (offline only)

- `0017_equipment_production_ready.sql` contains exactly seven operations: extend the status enum with `RETIRED`; add nullable `retired_at` and `retired_reason`; add non-null `version` default 1; add the three branch composite indexes. No destructive statement, table recreation, data rewrite, or unrelated SQL operation appears.
- The schema regression suite checks the complete seven-statement allowlist and MySQL identifier lengths, while preserving global unique equipment code.
- Offline Node inspection of tracked JSON confirmed the entire journal prefix through `0016` is unchanged from current main, snapshot `0017.prevId` equals `0016.id`, and only `equipment` changes semantically. `attendance_corrections` differs in JSON object-key ordering only, not schema meaning.
- Snapshot `equipment_code_unique` remains unique on `code` alone, not `(branch_id, code)`; existing single-column indexes remain alongside the new composite indexes.
- None of this proves actual database schema, row counts, defaults on existing rows, or MySQL DDL/locking behavior. Those require the approved database task.

## Remaining gates and known limits

1. Resolve the installed SWC runtime blocker and obtain a successful full production build; separately decide whether the old design-document whitespace must be cleaned up before branch acceptance.
2. Complete the independent whole-branch review and close any Critical/Important findings before database work.
3. In a controlled write-free window, perform aggregate-only DB preflight, verify migration journal `0016`, and check schema/invariants without exposing row data. Create the encrypted backup and pass dry-run restore verification before DDL.
4. Apply `0017` once, then verify journal, enum/columns/indexes/defaults, invariant counts and unchanged business row counts. MySQL DDL auto-commits: a partial failure requires inspection and forward repair, never blind retry.
5. Run authorized runtime/browser tests on port 3005: all roles, branch isolation, duplicate/stale 409 responses, retirement/history, maintenance, pagination, light/dark/mobile layouts, keyboard and dialog focus. These were deliberately not run here.
6. Real MySQL transaction rollback, `SELECT ... FOR UPDATE`, generated maintenance SQL behavior and concurrent sessions remain externally unverified; repository tests use in-memory fakes and generated-query assertions.
7. Previously documented limits remain: dashboard out-of-range pagination is not normalized to the last page; repeated detail `historyPage` query parameters are resolved with `URLSearchParams.get()`; legacy indexes have ongoing storage/write cost. No restore-from-retirement or branch-transfer feature was added.

No environment files or credential values were read, logged, or changed. Hardware/provider acceptance and live production readiness are outside this code-verification task.
