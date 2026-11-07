# Photo Storage Privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ป้องกันรูปสมาชิกและ quarantine ด้วย session/RBAC/private storage โดยไม่ทำให้รูป legacy หรือ PDPA cleanup สูญหาย

**Architecture:** ใช้ member-ID route เป็น authorization boundary เดียว แล้วให้ path helper resolve private/legacy candidates แบบ fail closed; proxy ปิด raw static paths ก่อน session handling และ UI ใช้ gateway แทน stored URL. งาน storage, route, callers และ privacy lifecycle อยู่ใน task เดียวเพราะต้อง deploy พร้อมกันเพื่อไม่ให้ข้อมูลรั่วหรือรูปเดิมหาย

**Tech Stack:** Next.js 16.4 App Router/Proxy, TypeScript, Drizzle ORM, Node `fs/promises`, Vitest

**Spec:** `docs/superpowers/specs/2026-11-07-photo-storage-privacy-design.md`

## Global Constraints

- ไม่เพิ่ม dependency และไม่แก้ schema
- ฟังก์ชัน/กฎธุรกิจที่เพิ่มหรือแก้ต้องมีคอมเมนต์ภาษาไทยอธิบายเหตุผล เงื่อนไขสำคัญ หรือผลข้างเคียง
- อ่าน relevant guides ใน `node_modules/next/dist/docs/` ก่อนแก้ Route Handler หรือ Proxy
- ใช้ TDD และรักษา member lock, audit transaction, commit-ack verification, rollback/restore behavior เดิม
- Error response/log ห้ามเผย session reason, SQL, filesystem path, token หรือ PII
- งานทั้งหมดต้องรองรับ port 3005 และไม่ทิ้ง dev server หยุดหลัง verification

## Review Focus

- Session malformed/revoked/expired/forced และ member-only cookie ต้องได้ fixed 404 เดียวกันโดยไม่ redirect
- Legacy reference และ opaque reference ที่อยู่ public เดิมต้องยังอ่านได้เมื่อได้รับอนุญาต แต่ raw URL ต้องไม่คืน bytes
- Private/public duplicate, shared reference และ `EXDEV` ต้อง fail closed โดยไม่เปลี่ยน consent/member/ledger
- Cleanup token เดิมและใหม่ต้องลบครบทุก candidate; partial failure ห้าม mark completed
- Upload/privacy race และ lost commit acknowledgement ต้องไม่ลบรูปที่ DB ยังอ้างถึงหรือคืนรูปที่ถอน consent แล้ว

---

### Task 1: Protected Member Photos and Private Lifecycle

**Files:**
- Modify: `lib/member-photo-path.ts`
- Modify: `lib/member-photo-service.ts`
- Create/Modify: `lib/member-photo-read-service.ts`
- Replace: `app/member-photos/[filename]/route.ts` with `app/member-photos/by-member/[id]/route.ts`
- Modify: `proxy.ts`, `lib/auth/route-policy.ts`, `.gitignore`
- Modify: `components/members/member-detail.tsx`, `components/access/scan-page.tsx`, `lib/access-service.ts`
- Modify: `lib/privacy-service.ts`
- Modify/Create matching `*.test.ts` and `*.test.tsx` files for every changed boundary
- Modify: `docs/operations/production-deployment.md`

**Interfaces:**
- Consumes: `requireFullSession()`, `hasPermission(actor, permission, resourceBranchId)`, `getMemberConsentSnapshot(memberId)`, current `MemberPhotoError` and privacy cleanup records
- Produces: `resolveMemberPhotoCandidates(photoUrl)`, private upload/quarantine paths, `readAuthorizedMemberPhoto(memberId): Promise<{ bytes: Buffer; contentType: string }>`, and `GET /member-photos/by-member/[id]`

- [ ] **Step 1: Write failing boundary tests**

Add focused tests for the spec acceptance criteria: authorized bytes; fixed denied responses and headers; private and legacy candidates; raw/optimizer denial; UI gateway callers; private upload; dual-root cleanup; shared/ambiguous/EXDEV fail-closed behavior; existing race and commit-ack-loss cases.

- [ ] **Step 2: Run focused tests and verify they fail for the missing protection**

Run only the new/updated photo, proxy, route-policy, member-detail, scan, upload and privacy test files. Expected: failures demonstrate public reads/raw path exposure/public writes/current caller URLs.

- [ ] **Step 3: Implement the smallest complete storage and read boundary**

Keep allowlists centralized in `member-photo-path.ts`; write new files under `storage/`; preserve safe legacy candidates; resolve only on `ENOENT`; reject ambiguous sources. Authenticate in a server-only read service, select the target member, check live PHOTO consent and permission OR against the target branch, and return only bytes/content type.

- [ ] **Step 4: Replace public presentation and close alternate paths**

Use only `/member-photos/by-member/${memberId}` in member detail, upload preview and access scan; include member ID in approved scan result. Remove the filename route/public route-policy entry. Add explicit proxy matchers and early fixed 404 for both raw directories plus optimizer attempts without reading cookies.

- [ ] **Step 5: Make the privacy lifecycle compatible and fail closed**

Move new quarantine files to `storage/privacy-cleanup`; delete validated token candidates in both roots; preserve the exact source for restore; reject shared references, duplicate candidates and cross-filesystem move before DB/consent/anonymization mutation.

- [ ] **Step 6: Run focused and full verification**

Run:

```text
npm test
npx tsc --noEmit
npm run lint
npx drizzle-kit generate
npm run build
```

Expected: all pass. Perform a production start smoke on port 3005 with existing raw fixtures and verify GET/HEAD raw paths return fixed denial, authorized gateway works, and unauthorized gateway does not leak. Restore dev server on port 3005.

- [ ] **Step 7: Update operations contract and commit**

Document private/legacy backup set, authenticated gateway, raw-path checks and rollback exposure. Commit only files in this task with a focused message.
