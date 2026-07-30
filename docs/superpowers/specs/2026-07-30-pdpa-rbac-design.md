# PDPA Compliance and Staff RBAC Design

**วันที่:** 30 กรกฎาคม 2026  
**สถานะ:** อนุมัติแบบแล้ว  
**ขอบเขต:** PDPA consent, anonymization request, audit log, staff accounts และ RBAC โดยยังไม่รวมหน้า Login

## 1. เป้าหมาย

เพิ่มระบบคุ้มครองข้อมูลส่วนบุคคลที่รองรับการให้และถอนความยินยอม การทำข้อมูลสมาชิกให้เป็นนิรนามตามคำขอ และการตรวจสอบย้อนหลัง พร้อมเพิ่มบัญชีพนักงานและ RBAC เพื่อจำกัดการทำงานตามบทบาท ระบบต้องรักษาข้อมูลธุรกรรมและบัญชีที่จำเป็นไว้โดยไม่เก็บข้อมูลที่สามารถระบุตัวสมาชิกหลังการทำข้อมูลนิรนาม

## 2. ข้อจำกัดและสมมติฐาน

- ระบบทำงานบน Next.js 16.2.6, React 19, Drizzle ORM, MySQL, Tailwind CSS และ shadcn/ui
- Development server และ production server ใช้พอร์ต `3005`
- ต้องอ่านคู่มือ Next.js ที่เกี่ยวข้องใน `node_modules/next/dist/docs/` ก่อนเขียนโค้ด
- Function และ business rule ใหม่ต้องมี comment ภาษาไทย
- ต้องรองรับ Light mode, Dark mode, responsive layout, keyboard navigation และข้อความผิดพลาดที่เข้าถึงได้
- รอบนี้ยังไม่มีหน้า Login หรือ session authentication
- Staff context ชั่วคราวไม่ใช่ security boundary และระบบต้องเปิดใช้เฉพาะเครือข่ายภายในที่เชื่อถือได้จนกว่าจะมี Login
- การเปลี่ยนจาก staff cookie เป็น authenticated session ภายหลังต้องไม่เปลี่ยน permission API หรือ audit schema

## 3. สถาปัตยกรรม

### 3.1 Staff context

สร้าง `staff-service` เป็นจุดเดียวสำหรับโหลดพนักงานปัจจุบันจาก httpOnly cookie ตรวจสถานะพนักงาน สาขา และบทบาท หากยังไม่มี cookie ในการเปิดระบบครั้งแรกให้ใช้ Owner เริ่มต้นที่ active แต่หาก cookie ระบุพนักงานที่ไม่มีอยู่หรือ inactive ต้องตอบ 401 โดยไม่ fallback เพื่อไม่ยกระดับสิทธิ์โดยไม่ตั้งใจ การเลือกพนักงานทำผ่าน Route Handler ซึ่งตรวจว่าพนักงาน active ก่อนตั้ง cookie

ทุก Server Component และ Route Handler ที่ต้องใช้สิทธิ์เรียก service กลาง ไม่อ่าน cookie โดยตรง เพื่อให้หน้า Login ในอนาคตเปลี่ยนเฉพาะ implementation ของ actor provider

### 3.2 Permission guard

สิทธิ์กำหนดเป็นค่าคงที่ใน TypeScript และตรวจด้วย `requirePermission(permission, options)` ฝั่งเซิร์ฟเวอร์ เมนูและปุ่มใช้ permission snapshot เพื่อซ่อน action ที่ทำไม่ได้ แต่การซ่อน UI ไม่ใช้แทน server guard

Permission หลัก:

| Permission | Owner | Manager | Counter | Trainer |
|---|---:|---:|---:|---:|
| `staff.manage` | ทุกสาขา | พนักงานในสาขาตน ยกเว้น Owner | ไม่ได้ | ไม่ได้ |
| `privacy.consent.manage` | ได้ | ได้ในสาขาตน | ได้ในสาขาตน | ไม่ได้ |
| `privacy.request.create` | ได้ | ได้ในสาขาตน | ได้ในสาขาตน | ไม่ได้ |
| `privacy.request.approve` | ได้ | ได้ในสาขาตน | ไม่ได้ | ไม่ได้ |
| `audit.read` | ทุกสาขา | สาขาตน | ไม่ได้ | ไม่ได้ |
| `members.manage` | ได้ | ได้ในสาขาตน | ได้ในสาขาตน | อ่านเฉพาะข้อมูลที่ใช้กับ PT/คลาส |
| `payments.manage` | ได้ | ได้ในสาขาตน | ได้ในสาขาตน | ไม่ได้ |
| `access.manage` | ได้ | ได้ในสาขาตน | ได้ในสาขาตน | ไม่ได้ |
| `classes.manage` | ได้ | ได้ในสาขาตน | อ่าน/จอง | ได้ในสาขาตน |
| `pt.manage` | ได้ | ได้ในสาขาตน | อ่าน/นัดหมาย | ได้ในสาขาตน |
| `accounting.manage` | ได้ | ได้ในสาขาตน | ไม่ได้ | ไม่ได้ |
| `settings.manage` | ได้ | ได้เฉพาะค่าระดับสาขา | ไม่ได้ | ไม่ได้ |

Owner ข้ามสาขาได้ Manager, Counter และ Trainer ถูกจำกัดด้วย `homeBranchId` ของพนักงานและ branch context ปัจจุบัน การพยายามเข้าถึงสาขาอื่นต้องได้ HTTP 403

## 4. แบบจำลองข้อมูล

### 4.1 `staff`

- `id`, `staffCode` unique, `firstName`, `lastName`
- `homeBranchId` foreign key ไป `branches`
- `role`: `OWNER`, `MANAGER`, `COUNTER`, `TRAINER`
- `phone`, `email`, `status`: `ACTIVE`, `INACTIVE`
- `createdAt`, `updatedAt`

Migration สร้าง `OWNER001 / ผู้ดูแลระบบ` บทบาท Owner ที่สาขาหลัก id 1 เพื่อให้ระบบเดิมเปิดต่อได้ทันที

### 4.2 `consent_events`

ตาราง append-only:

- `id`, `memberId`, `branchId`, `recordedByStaffId`
- `consentType`: `SERVICE_PRIVACY`, `MARKETING`, `PHOTO`
- `action`: `GRANTED`, `WITHDRAWN`
- `policyVersion`, `source`: `FRONT_DESK`, `MIGRATION`, `PRIVACY_REQUEST`
- `note`, `createdAt`

สถานะปัจจุบันคำนวณจาก event ล่าสุดของสมาชิกและประเภทนั้น ห้าม update/delete event ผ่าน application API

### 4.3 `privacy_requests`

- `id`, `memberId`, `branchId`
- `requestType`: `ANONYMIZATION`
- `status`: `PENDING`, `APPROVED`, `COMPLETED`, `REJECTED`
- `reason`, `requestedByStaffId`, `requestedAt`
- `reviewedByStaffId`, `reviewedAt`, `reviewNote`
- `completedAt`
- `fileCleanupStatus`: `NOT_REQUIRED`, `PENDING`, `COMPLETED`, `FAILED`
- `fileCleanupError` สำหรับข้อความเทคนิคที่ไม่มี PII

สมาชิกมีคำขอ `PENDING` หรือ `APPROVED` ได้ไม่เกินหนึ่งรายการ ผู้สร้างคำขอและผู้อนุมัติต้องเป็นคนละคน

### 4.4 `audit_logs`

ตาราง append-only:

- `id`, `branchId`, `actorStaffId`
- `action`, `entityType`, `entityId`
- `result`: `SUCCESS`, `DENIED`, `FAILED`
- `metadata` JSON ที่เก็บเฉพาะ id, ชื่อฟิลด์ และสถานะ ห้ามเก็บค่าก่อน/หลังที่เป็น PII
- `createdAt`

ไม่มี Route Handler สำหรับแก้ไขหรือลบ audit log

## 5. Consent Flow

### 5.1 สมัครสมาชิก

- ต้องมี `SERVICE_PRIVACY = GRANTED` ใน request เดียวกับการสมัคร จึงสร้างสมาชิกได้
- `MARKETING` และ `PHOTO` เป็น optional และ default เป็นไม่ให้ความยินยอม
- หากไม่ได้ให้ PHOTO consent ต้องไม่อัปโหลดหรือบันทึก `photoUrl`
- การสร้างสมาชิกและ consent events ต้องอยู่ใน transaction เดียวกัน

### 5.2 ให้หรือถอนความยินยอม

- เพิ่ม event ใหม่ทุกครั้ง ไม่แก้ event เก่า
- ถอน MARKETING แล้ว CRM ต้องไม่นำสมาชิกไปอยู่ในกลุ่มเป้าหมายการตลาดหรือการติดต่อแบบแคมเปญ
- ถอน PHOTO แล้วตั้ง `photoUrl = null` และสร้างงานลบไฟล์
- ถอน SERVICE_PRIVACY แล้วต้องตั้งสมาชิกเป็น `SUSPENDED` ทันทีเพื่อหยุดการเข้าใช้บริการและเปิด dialog ให้พนักงานเลือกสร้างคำขอ anonymization แยกต่างหาก การกลับมาใช้บริการต้องให้ SERVICE_PRIVACY consent ใหม่ก่อนเปลี่ยนสถานะกลับเป็น `ACTIVE`

## 6. Anonymization Flow

1. พนักงานที่มี `privacy.request.create` สร้างคำขอพร้อมเหตุผล
2. Owner หรือ Manager คนอื่นที่มี `privacy.request.approve` อนุมัติหรือปฏิเสธ
3. ก่อนอนุมัติตรวจสมาชิก สาขา สถานะคำขอ คำขอซ้ำ และ separation of duties
4. เมื่ออนุมัติให้ทำ database anonymization ใน transaction เดียว
5. เขียน consent withdrawal events และ audit success ภายใน transaction เดียวกัน
6. หลัง commit ลบไฟล์รูป ถ้าล้มเหลวให้ `fileCleanupStatus = FAILED` และเปิด action ลองใหม่
7. คำขอเป็น `COMPLETED` ต่อเมื่อ database anonymization สำเร็จและไฟล์เป็น `COMPLETED` หรือ `NOT_REQUIRED`

### 6.1 ข้อมูลที่ต้องล้าง

`members`:

- เปลี่ยน `memberCode` เป็น `ANON-{memberId}-{randomToken}` ซึ่งไม่มีรหัสเดิม
- เปลี่ยนชื่อเป็น `ข้อมูลถูกลบ` และนามสกุลเป็นรหัสนิรนาม
- ตั้ง `idCard`, `phone`, `email`, `birthDate`, `gender`, `address`, `photoUrl`, `note` เป็น null
- ตั้ง status เป็น `CANCELLED`

ข้อมูลเกี่ยวข้อง:

- ยกเลิกการผูก `card_pool.memberId` และตั้งบัตรเป็น `AVAILABLE`
- แทน `access_logs.serial` ด้วย token เฉพาะ log ที่ไม่เชื่อมกลับไปยัง serial เดิม
- ปิด marketing consent ใน CRM และแทน free-text interaction ด้วยข้อความมาตรฐาน
- แทน notification title/message และ loyalty free-text reason ด้วยข้อความมาตรฐาน
- ล้าง `pt_sessions.weightKg`, `bmi`, `waistCm`, `bodyFatPercent`, `workoutSummary`, `trainerNote`
- ล้าง free-text note ในข้อมูลสมาชิก แพ็กเกจ การชำระเงิน การจอง และคำขอที่อาจมี PII โดยคงฟิลด์การเงิน วันเวลา สถานะ และ foreign key ไปยังสมาชิกนิรนาม

### 6.2 ข้อมูลที่ต้องคงไว้

- Payment amount, method, status, receipt number, promotion และวันที่
- Member package, class booking, PT package/session schedule หลังล้างข้อมูลสุขภาพ
- Access result, timestamp และ branch หลังล้าง serial
- Accounting, expense และ reconciliation
- Privacy request, consent event และ audit metadata ที่ไม่มี PII

## 7. Audit Coverage

บันทึก SUCCESS สำหรับ mutation ของโมดูลต่อไปนี้:

- Staff และ branch context changes
- Member create/update, card assignment, consent และ privacy request
- Payment, coupon, promotion และ accounting
- Access scan decision
- Locker rent/release
- Equipment และ maintenance
- Class booking/cancel และ PT session lifecycle
- Notification settings/generation
- CRM interaction และ loyalty point/reward

บันทึก DENIED เมื่อ permission guard ปฏิเสธคำขอที่มี actor ถูกต้อง บันทึก FAILED เฉพาะ failure ที่ผ่าน validation แล้วและเริ่ม business operation โดย metadata ห้ามมี request body หรือ PII

## 8. UI/UX

### 8.1 Sidebar

เพิ่ม staff switcher แสดงชื่อ รหัส บทบาท และสาขา พร้อมข้อความชัดเจนว่าเป็นผู้ปฏิบัติงานปัจจุบัน เมนูกรองตาม permission snapshot

### 8.2 `/settings/staff`

- สรุปจำนวนพนักงานตามสถานะและบทบาท
- ตารางค้นหา/กรองตามสาขา บทบาท และสถานะ
- Dialog เพิ่มและแก้ไขพนักงาน
- Manager สร้างได้เฉพาะ Manager, Counter, Trainer ในสาขาตน และแก้ Owner ไม่ได้

### 8.3 `/settings/privacy`

- Stat cards: รออนุมัติ, กำลังดำเนินการ, ลบไฟล์ล้มเหลว, เสร็จสิ้น
- ตารางกรองตามสถานะ สาขา วันที่ และสมาชิก
- Dialog อนุมัติ/ปฏิเสธแสดงผลกระทบและบังคับพิมพ์ `ANONYMIZE` ก่อนอนุมัติ
- Action ลองลบไฟล์ใหม่สำหรับรายการ FAILED

### 8.4 `/settings/audit`

- กรองตามช่วงวันที่ สาขา พนักงาน action, entity และ result
- Pagination ฝั่งเซิร์ฟเวอร์
- แสดง metadata แบบอ่านง่ายโดยไม่เปิดเผย PII

### 8.5 Member detail

เพิ่ม Privacy card ที่แสดง consent ปัจจุบัน ประวัติ event ปุ่มให้/ถอน consent และปุ่มสร้างคำขอ anonymization สมาชิกที่ anonymized แล้วเป็น read-only และไม่แสดง PII

ทุกหน้าต้องใช้ design tokens เดิม, รองรับ Light/Dark, mobile table overflow, focus-visible, aria-live, confirmation dialog และ loading state

## 9. Error Handling และ Rate Limit

- Validation error: HTTP 400 พร้อมข้อความภาษาไทยที่ไม่สะท้อน PII กลับมา
- Cookie อ้างพนักงานที่ไม่มีอยู่หรือ staff inactive: HTTP 401; กรณีไม่มี cookie ครั้งแรกใช้ Owner seed เพื่อ bootstrap
- ไม่มี permission หรือผิดสาขา: HTTP 403
- ไม่พบ resource: HTTP 404
- คำขอซ้ำหรือ state conflict: HTTP 409
- Server error: HTTP 500 และบันทึกเฉพาะ error code ฝั่ง client
- Privacy create/approve/retry จำกัด 10 requests ต่อ staff ต่อ 1 นาทีด้วย in-memory fixed window สำหรับ single-instance deployment รอบนี้
- หาก database transaction ล้มเหลว ห้ามเปลี่ยน privacy request เป็น COMPLETED

## 10. Testing Strategy

เพิ่ม Vitest และทดสอบแบบ Red-Green-Refactor:

- Permission matrix ของทุกบทบาทและ branch boundary
- Staff context fallback, inactive staff และ cookie validation
- Consent latest-state calculation และ append-only behavior
- Required service consent ตอนสมัครสมาชิก
- Marketing/photo withdrawal side effects
- Duplicate privacy request และ separation of duties
- Anonymization plan ล้าง PII ครบและคงข้อมูลธุรกรรมตามรายการ
- Rollback เมื่อขั้นตอนฐานข้อมูลใดล้มเหลว
- File cleanup success, failure และ retry
- Route guard ส่ง 401/403/409 ถูกต้อง
- Audit metadata ไม่มี prohibited PII keys หรือ values

Verification รอบสุดท้าย:

- `npm test`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `npx drizzle-kit migrate`
- Browser QA ที่ `http://localhost:3005` ทั้ง Light/Dark, desktop/mobile, keyboard และ console

## 11. Success Criteria

- สมัครสมาชิกไม่ได้หากไม่มี service privacy consent
- ให้และถอน consent ทั้ง 3 ประเภทแยกกันได้และดูประวัติย้อนหลังได้
- Owner/Manager อนุมัติ anonymization ได้ตามขอบเขตสาขาและ separation of duties
- หลัง anonymization ไม่พบ PII ที่กำหนดใน member, CRM, notification, loyalty, access serial และ PT health fields
- รายการชำระเงิน บัญชี แพ็กเกจ การเข้าใช้ และประวัติธุรกรรมยังใช้ออกรายงานได้
- API ปฏิเสธ role และ branch ที่ไม่มีสิทธิ์แม้เรียกตรงโดยไม่ผ่าน UI
- Mutation ที่อยู่ใน audit coverage มี actor, branch, action และ result ตรวจสอบย้อนหลังได้
- ระบบเดิมเปิดใช้งานต่อได้ด้วย Owner seed และพอร์ต 3005

## 12. งานที่ไม่รวมในรอบนี้

- หน้า Login, password hashing, password reset, 2FA และ authenticated session
- Member self-service portal สำหรับยื่นคำขอเอง
- External object storage และ distributed job queue
- การส่งคำขอ PDPA ไปยังหน่วยงานภายนอก
- การกำหนด retention period อัตโนมัติตามหมวดเอกสาร
