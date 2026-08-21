# Equipment Production Readiness Report

วันที่ตรวจสอบ: 2026-08-21

Branch: `codex/equipment-production-ready`

Merge base กับ `main`: `a7ae3f6d5905578464ddf3fcb8818cf2bb1cc3d5`

HEAD ก่อนรายงาน: `9bd6ff70cda1d78aca6cb2c3c42410b5651c3da8`

## วัตถุประสงค์และขอบเขต

ตรวจสอบงานระบบอุปกรณ์ Tasks 1–9 แบบ evidence-first และเตรียมลำดับ handoff ที่ปลอดภัย โดย Task 10 นี้ไม่ apply migration, ไม่แก้ข้อมูลฐานข้อมูล, ไม่ merge/push, ไม่ restart หรือ kill port 3005 และไม่ทำ browser mutation

## Commit ที่ตรวจสอบ

ช่วง `main..9bd6ff7` มี 18 commits:

1. `e45f323` — `docs: design production-ready equipment management`
2. `cc14697` — `docs: plan production-ready equipment management`
3. `88c4fa6` — `feat: add equipment retirement lifecycle schema`
4. `93e2424` — `fix: display retired equipment safely`
5. `d5cb96a` — `feat: add equipment read and manage permissions`
6. `6f61e1e` — `fix: gate equipment maintenance alerts`
7. `a03384d` — `refactor: centralize equipment domain rules`
8. `7342fe2` — `feat: paginate equipment dashboard data`
9. `835a7eb` — `feat: enforce equipment lifecycle concurrency`
10. `f7b5f9e` — `fix: classify wrapped equipment code conflicts`
11. `1bcb115` — `fix: match equipment code constraint exactly`
12. `c4eabb9` — `feat: harden equipment maintenance transactions`
13. `a98734d` — `feat: secure equipment api boundaries`
14. `f14c938` — `fix: harden equipment route context`
15. `3d4bd5c` — `feat: add paginated equipment dashboard`
16. `0b31875` — `fix: correct equipment maintenance presentation`
17. `b8e18c8` — `feat: add equipment management workflows`
18. `9bd6ff7` — `fix: align equipment edit and table contracts`

## Contracts ที่ส่งมอบจาก Tasks 1–9

- Schema รองรับ `RETIRED`, `retiredAt`, `retiredReason`, `version` และยังคง global unique equipment code
- RBAC แยก `equipment.read` และ `equipment.manage`: Owner/Manager อ่านและจัดการ; Counter/Trainer อ่านอย่างเดียว
- Domain rules รวม strict calendar dates, lifecycle, meter monotonicity, maintenance state และ Zod mutation contracts
- Dashboard และ history ใช้ server pagination/filter ขนาดหน้า 20; summary คำนวณระดับทั้ง branch
- Master/operation/retirement/maintenance mutations ใช้ branch scope, row lock, required `expectedVersion`, compare-and-set และ Audit ใน transaction
- Route Handlers ตรวจ trusted Origin, authoritative session/RBAC, fixed safe errors และ Bangkok calendar date
- UI แยก responsive desktop/mobile dashboard, semantic light/dark tokens, URL state, accessible dialogs และ fixed client error copy
- UI management รองรับ create/edit/operation/maintenance/retire; stale 409 refresh โดยไม่ retry และซ่อน mutation controls จาก read-only roles

## Migration และ schema

ไฟล์ `drizzle/0011_equipment_production_ready.sql` มีเฉพาะ:

- ขยาย status enum ด้วย `RETIRED`
- เพิ่ม nullable `retired_at` และ `retired_reason varchar(500)`
- เพิ่ม `version int not null default 1`
- เพิ่ม composite indexes `(branch_id, status)`, `(branch_id, category)` และ `(branch_id, next_maintenance_date)`

ผลตรวจ:

- destructive keyword scan: 0 matches สำหรับ `DROP`, `DELETE`, `TRUNCATE`
- snapshot ยืนยัน retirement columns เป็น nullable, version เป็น non-null/default 1 และ `equipment_code_unique(code)` ยังเป็น global unique constraint
- snapshot เก็บทั้ง legacy single-column indexes และ composite indexes ตาม ruling เพื่อหลีกเลี่ยง destructive migration
- journal ของ branch มี tag `0011_equipment_production_ready`; `main` ยังไม่มี tag นี้
- Task 10 ไม่ได้ apply migration ใด ๆ สถานะว่าฐานข้อมูลเป้าหมายเคยถูก migrate มาก่อนหรือไม่ยังยืนยันไม่ได้ เพราะ DB preflight ไม่ได้รัน

## Automated verification

| Check | ผลลัพธ์ | หลักฐาน |
|---|---|---|
| Focused equipment suite | PASS, exit 0 | 9 files, 144 tests, 18.48s |
| Security regressions | PASS, exit 0 | 5 files, 57 tests, 10.03s |
| Full Vitest run 1 | FAIL, exit 1 | 59/60 files, 454/455 tests; `scripts/bootstrap-owner.test.ts` CLI case timeout 5000ms; 71.48s |
| Focused bootstrap file | PASS, exit 0 | 1 file, 10 tests, 4.37s |
| Full Vitest fresh rerun | FAIL, exit 1 | failure เดิมเพียงรายการเดียว; 59/60 files, 454/455 tests; 69.11s |
| TypeScript | PASS, exit 0 | `tsc --noEmit --pretty false`, ไม่มี diagnostic |
| ESLint | PASS with warnings, exit 0 | 0 errors, 4 warnings: 2 `no-img-element`, 2 unused `datetime`; ทั้งหมดอยู่นอก equipment slice |
| Next production build | BLOCKED/FAIL, exit 1 | native SWC ใน worktree ไม่ใช่ valid Win32 application และ sandbox ห้ามสร้าง fallback cache ใน AppData |
| Elevated build retry | TIMEOUT/UNRESOLVED | ถูกยกเลิกหลัง 900s; ไม่มี captured build verdict และไม่ rerun ต่อ |
| `git diff --check main...HEAD` | FAIL, exit 1 | pre-existing trailing whitespace ใน tracked spec บรรทัด 3, 4 และ blank line ที่ EOF บรรทัด 450 |

Full-suite failure ตรงกับ load-sensitive bootstrap baseline ที่บันทึกไว้ก่อนเริ่ม feature และ focused file ผ่านทันที แต่รายงานนี้ไม่ถือว่า full Vitest ผ่าน ส่วน production build ก็ไม่ถือว่าผ่านเพราะไม่มี successful exit 0

## Database preflight

สถานะ: `BLOCKED / NOT RUN`

- process environment ไม่มี `DATABASE_URL`; พบเพียงว่ามีไฟล์ environment โดยไม่ได้อ่านหรือแสดงค่า
- การเข้าถึง target DB ต้องข้าม execution/network boundary และไม่มี approval สำหรับ read-only DB query ในรอบนี้
- จึงยังไม่มีหลักฐานจากฐานจริงสำหรับ migration journal, row counts, duplicate global code groups, invalid lifecycle/version/date counts หรือ column/index existence
- ไม่มีการพิมพ์ URL, host, credential, hash, raw row, serial/note, staff/member data, IP, token หรือ user-agent

## Security, secret และ Audit classification

- exact changed-line scan ตาม pattern ที่กำหนดพบ 35 บรรทัด; case-insensitive added-line audit พบเฉพาะ docs, test sentinel/assertion และ generated Drizzle snapshot schema field names
- ไม่พบ secret value หรือ production credential ใน changed lines ที่ตรวจ; snapshot มีเฉพาะ schema metadata ไม่มี row data
- Audit tests และ implementation ใช้ action allowlist และ metadata allowlist; ไม่อนุญาต note, serial, retirement free-text, token/hash, raw IP หรือ full user-agent
- stale version อาจสร้าง sanitized FAILED diagnostic Audit ตาม controller ruling แต่ต้องไม่มี SUCCESS Audit และไม่มี state/version mutation
- Audit failure ใน mutation transaction ต้อง rollback mutation; focused service/repository/route tests ผ่าน

## Deferred concerns และ rulings

- ยังไม่มี integration test ที่รัน generated Drizzle/MySQL predicates, real transaction, `SELECT ... FOR UPDATE`, compare-and-set และ rollback กับ MySQL จริง
- zero-total และ overflow pagination deterministic แต่ยังไม่มี contract test สำหรับ page เกิน `totalPages`
- repeated `historyPage` values ถูกยุบด้วย `URLSearchParams.get()` และ max+1 ยังไม่มี test
- คง legacy equipment indexes ควบคู่ composite indexes เพื่อรักษา no-DROP migration boundary; มีต้นทุน write/storage จนกว่าจะมี cleanup migration ที่อนุมัติแยก
- operation `expectedVersion` เป็น required แบบ fail-closed ไม่มี fallback
- retirement ไม่มี restore และไม่มี branch transfer ในรอบนี้
- responsive/light/dark/keyboard/focus ผ่าน DOM/static review เท่านั้น ยังไม่มี authenticated live browser evidence
- full Vitest ยังมี baseline load-sensitive timeout และ build ยังถูก SWC environment block จึงเป็น acceptance blockers ที่ต้องตัดสินใจก่อน merge

## Post-integration browser QA matrix สำหรับ port 3005

| Scenario | สิ่งที่ต้องพิสูจน์ |
|---|---|
| Owner | CRUD/operation/maintenance/retire ใน selected branch; อ่าน branch อื่นตาม owner context ที่อนุญาต |
| Manager | CRUD ครบใน home branch; direct URL/API ข้าม branch ถูกปฏิเสธ |
| Counter / Trainer | อ่าน dashboard/detail/history ได้ แต่ไม่มี manage controls และ mutation API ตอบ 403 |
| Duplicate code | create/edit รหัสซ้ำทั้งบริษัทตอบ 409 ด้วย fixed copy; ไม่มีข้อมูลเดิมรั่ว |
| Stale version | mutation สอง session ทำให้ request เก่าตอบ 409, refresh หนึ่งครั้ง, ไม่ auto-retry และไม่มี SUCCESS Audit |
| Maintenance | scheduled/in-progress/completed, date ordering, meter/next maintenance transition และ retired rejection |
| Retirement | ต้องมีเหตุผล 2–500 ตัวอักษร; หลัง retire ดู history ได้แต่ operation/maintenance ถูกปิด |
| Pagination/filter/history | URL state, reset, cross-tab state, empty/filtered-empty, overflow page และ detail history page |
| Responsive/theme | Desktop/mobile, light/dark, long content, ไม่มี horizontal page overflow |
| Accessibility | keyboard-only, visible focus, dialog trap/Escape/focus restore, labels/errors/live regions, 44px targets |
| Audit | action/actor/branch/entity ถูกต้อง, metadata อยู่ใน allowlist, rollback เมื่อ Audit fail |
| Login monitoring | เฝ้าดู first-login/logout-login bounce และเปรียบเทียบ successful/failed/rate-limited Audit ตาม diagnostic เดิม |

## Safe integration sequence

1. แก้หรือจัดเตรียม SWC runtime ให้ `next build` ได้ exit 0 โดยไม่แก้ feature code
2. ตัดสินใจว่าจะยอมรับ baseline full-suite timeout หรือแก้ที่ test/process isolation แล้วรัน full suite ใหม่
3. Review และแก้ trailing whitespace ใน spec ด้วย commit เอกสารแยก หากต้องการให้ branch-wide diff check ผ่าน
4. ทำ independent whole-branch specification/code review
5. หลัง review ผ่าน จึง merge branch โดย authorization แยก; ยังไม่ migrate
6. ทำ backup/restore plan และ read-only DB preflight aggregates โดยไม่แสดงข้อมูลอ่อนไหว
7. ขออนุมัติ migration แยก ตรวจ schema/index/journal และ invariants หลัง migrate
8. ขออนุมัติ restart dev server port 3005 โดยรักษา auth secrets
9. ทำ authenticated browser QA ตาม matrix ทุก role/viewport/theme ก่อน acceptance
10. push/deploy เฉพาะเมื่อ automated, DB และ browser acceptance ได้ข้อสรุปชัดเจน

## Explicit non-actions

Task 10 นี้ไม่ได้ apply migration, เปลี่ยน DB row, merge, push, restart/kill port 3005 หรือทำ authenticated browser mutation
