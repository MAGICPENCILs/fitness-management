# Equipment Production-Ready Design

วันที่: 2026-08-21  
สถานะ: รอผู้ใช้ตรวจทานก่อนเขียน implementation plan  
ขอบเขต: รอบ 1 — ยกระดับระบบอุปกรณ์และการบำรุงรักษาเดิมให้พร้อมใช้งานจริง

## 1. เป้าหมาย

ยกระดับหน้า `/equipment` และ backend เดิมให้เป็นระบบทะเบียนอุปกรณ์ที่ปลอดภัย ใช้งานได้หลายบทบาท รองรับข้อมูลจำนวนมาก และรักษาประวัติย้อนหลัง โดยยังคง workflow การบำรุงรักษาแบบปัจจุบันไว้ก่อน

ผลลัพธ์หลัก:

- ทุกบทบาทที่เข้าสู่ระบบดูสถานะความพร้อมของอุปกรณ์ในขอบเขตสาขาที่ได้รับอนุญาตได้
- Owner และ Manager จัดการทะเบียน มิเตอร์ สถานะ และบันทึกการบำรุงได้
- อุปกรณ์เลิกใช้ด้วย lifecycle state แทนการลบจริง
- รายการและประวัติรองรับ filter และ pagination ฝั่งฐานข้อมูล
- mutation ทุกจุดตรวจ Session, RBAC, สาขา, Origin, validation และ concurrency
- การเปลี่ยนแปลงสำคัญมี Audit ที่ไม่เก็บข้อมูลละเอียดเกินจำเป็น
- UI รองรับ Desktop, Mobile, Light/Dark mode, keyboard และ screen reader
- behavior ใหม่มี regression tests ก่อน implementation ตาม TDD

## 2. สภาพปัจจุบัน

ระบบเดิมมี:

- ตาราง `equipment` และ `maintenance_records`
- สถานะ `OPERATIONAL`, `MAINTENANCE`, `OUT_OF_SERVICE`
- รอบบำรุงตามชั่วโมงและวันที่
- การแจ้งเตือน `OVERDUE`, `DUE_SOON`, `SCHEDULED`, `NONE`
- เพิ่มอุปกรณ์ อัปเดตมิเตอร์/สถานะ และเพิ่มรายการบำรุง
- ค่าใช้จ่าย ช่างผู้ดูแล และประวัติล่าสุด 50 รายการ
- branch scope, `settings.manage` และ Audit เบื้องต้น

ข้อจำกัดสำคัญ:

- Counter และ Trainer เปิดหน้าไม่ได้ แม้ต้องใช้ข้อมูลสถานะในการปฏิบัติงาน
- ไม่มี lifecycle เลิกใช้งานที่รักษาประวัติ
- แก้ข้อมูลทะเบียนเดิมไม่ได้
- โหลดทะเบียนทั้งหมดและจำกัดประวัติแบบค่าคงที่ 50 รายการ
- UI รวมอยู่ใน client component เดียวขนาดใหญ่
- ไม่มี test เฉพาะระบบอุปกรณ์
- mutation ยังขาด Origin check, optimistic concurrency และ safe error logging ที่สม่ำเสมอ

## 3. สิ่งที่ไม่ทำในรอบนี้

- workflow เปลี่ยนงานนัดหมายเดิมจาก `SCHEDULED` → `IN_PROGRESS` → `COMPLETED` (รอบ 2)
- มอบหมายช่างภายใน SLA การอนุมัติ และ notification automation (รอบ 2)
- โอนอุปกรณ์ข้ามสาขาและประวัติการโอน (รอบ 3)
- ผู้ขาย ใบสั่งซื้อ เอกสารแนบ QR/Barcode และค่าเสื่อมราคา (รอบ 3)
- ลบอุปกรณ์หรือประวัติจริง
- เปลี่ยนรหัสอุปกรณ์ให้ซ้ำกันได้ระหว่างสาขา
- เปลี่ยนโครงสร้าง Login/Session ที่กำลังวินิจฉัยแยกบน `main`

## 4. กฎธุรกิจ

### 4.1 รหัสและขอบเขตสาขา

- `equipment.code` ต้องไม่ซ้ำทั้งบริษัท
- อุปกรณ์อยู่ในสาขาเดียวตลอดรอบนี้
- Owner ใช้ branch context ที่เลือกอยู่
- Manager ถูกจำกัดที่ home branch
- Counter และ Trainerอ่านได้เฉพาะ branch context ที่ service อนุญาต
- ไม่มี API เปลี่ยน `branchId`

### 4.2 Lifecycle อุปกรณ์

เพิ่มสถานะ `RETIRED` โดยมีเงื่อนไข:

- ต้องระบุเหตุผล 2–500 ตัวอักษร
- ระบบบันทึก `retiredAt`
- ไม่ลบ row อุปกรณ์หรือ maintenance history
- อุปกรณ์ `RETIRED` เพิ่มชั่วโมง เปลี่ยน operational status หรือสร้างงานบำรุงใหม่ไม่ได้
- ยังค้นหาและเปิดประวัติได้เมื่อเลือก filter เลิกใช้งาน
- รอบนี้ไม่มีปุ่มคืนสถานะจาก `RETIRED`; การคืนสถานะเป็นงานแยกที่ต้องมี Audit และข้อกำหนดเฉพาะ

### 4.3 มิเตอร์และรอบบำรุง

- ชั่วโมงใช้งานใหม่ต้องไม่น้อยกว่าค่าปัจจุบัน
- เมื่อปิดงานบำรุง `COMPLETED` ระบบคำนวณ `nextMaintenanceHours` จากค่ามิเตอร์บริการบวก interval
- วันที่เสร็จต้องไม่ก่อนวันที่นัดหมาย
- วันสิ้นสุดประกันต้องไม่ก่อนวันที่ซื้อ
- วันที่ทุกค่าต้องเป็น calendar date จริง ไม่ใช่เพียง string ที่ตรง regex
- เกณฑ์แจ้งเตือนเดิมคงไว้: เกินกำหนดเมื่อชั่วโมงหรือวันติดลบ; ใกล้กำหนดเมื่อเหลือไม่เกิน 50 ชั่วโมงหรือ 7 วัน

## 5. RBAC และ Security Boundary

เพิ่ม permissions:

| Permission | Owner | Manager | Counter | Trainer |
|---|---:|---:|---:|---:|
| `equipment.read` | ✓ | ✓ | ✓ | ✓ |
| `equipment.manage` | ✓ | ✓ | — | — |

การบังคับใช้:

- route policy ของ `/equipment` ใช้ `equipment.read`
- Sidebar แสดงเมนูเมื่อมี `equipment.read`
- Server Component ตรวจ authoritative `equipment.read` ก่อน query
- Route Handler แบบ mutation ตรวจ `equipment.manage` และ branch scope อีกครั้ง
- UI ใช้ permission ที่ได้จาก authoritative staff context เพื่อซ่อน action แต่ UI ไม่ใช่ security boundary
- mutation ทุกจุดเรียก `assertTrustedOrigin` ก่อนอ่าน body
- ตอบ 401 เมื่อ Session ไม่ถูกต้อง, 403 เมื่อไม่มีสิทธิ์/ข้ามสาขา, 404 เมื่อ entity ไม่อยู่ใน scope
- log เฉพาะ error name หรือข้อความกลาง ห้าม log raw Drizzle error/params

## 6. Data Model และ Migration

### 6.1 `equipment`

เปลี่ยนแปลง:

- เพิ่ม `RETIRED` ใน status enum
- เพิ่ม `retired_at timestamp null`
- เพิ่ม `retired_reason varchar(500) null`
- เพิ่ม `version int not null default 1` สำหรับ optimistic concurrency
- คง unique index ของ `code` แบบทั้งบริษัท
- เพิ่ม composite indexes ที่สอดคล้องกับ query หลัก:
  - `(branch_id, status)`
  - `(branch_id, category)`
  - `(branch_id, next_maintenance_date)`

Invariant:

- status เป็น `RETIRED` ต้องมี `retiredAt` และ `retiredReason`
- status อื่นต้องไม่เปลี่ยน `retiredAt`/`retiredReason` ผ่าน API รอบนี้
- ทุก mutation เพิ่ม `version` ทีละ 1

### 6.2 `maintenance_records`

ไม่มี column ใหม่ในรอบนี้ ข้อมูลเดิมต้องยังอ่านได้ทั้งหมด

### 6.3 Migration safety

- migration ต้องไม่มี `DROP`, `DELETE` หรือ `TRUNCATE`
- row เดิมได้ `version = 1`
- row เดิมไม่มีค่า retirement
- ตรวจ schema และ index หลัง migrate
- ไม่รัน migration กับฐานข้อมูลจริงจนกว่าจะมี preflight, backup/restore plan และผู้ใช้อนุมัติ

## 7. Query และ DTO

### 7.1 Equipment dashboard query

Input ที่อนุญาต:

- `search`: รหัส ชื่อ Serial หรือตำแหน่ง
- `status`: enum หรือ `ALL`
- `category`: enum หรือ `ALL`
- `maintenance`: `ALL`, `OVERDUE`, `DUE_SOON`, `SCHEDULED`, `NONE`
- `page`: positive integer
- `pageSize`: server-owned คงที่ 20

ผลลัพธ์:

- summary counts จากข้อมูลทั้ง branch ไม่ใช่เฉพาะหน้าปัจจุบัน
- paginated equipment rows
- `page`, `pageSize`, `total`, `totalPages`
- DTO แปลง Date/Decimal ให้ serializable ก่อนส่ง client

การคำนวณ maintenance filter ต้องทำที่ query/service boundary อย่างมี test ไม่โหลดทุก row มาคัดใน browser

### 7.2 Maintenance history query

- ใช้ tab และ URL state แยก `tab=equipment|history`
- ประวัติรองรับ `historyPage` ขนาดหน้า 20
- filter ตาม equipment, type และ status ได้
- ไม่ใช้ hard limit 50

### 7.3 Equipment detail

เพิ่ม authoritative read endpoint:

`GET /api/equipment/:id?historyPage=N`

คืน:

- ข้อมูลทะเบียนและสถานะที่ผ่าน branch scope
- maintenance state ปัจจุบัน
- ประวัติของอุปกรณ์แบบ paginated
- ไม่คืน field ภายในหรือข้อมูลนอก branch

## 8. Mutation API

### 8.1 สร้างอุปกรณ์

`POST /api/equipment`

- คง flow เดิมแต่เพิ่ม Origin, safe error และ transaction/concurrency conventions
- รหัสถูก trim + uppercase และตรวจ unique ทั้งบริษัท
- คำนวณรอบชั่วโมงเริ่มต้นจากมิเตอร์ปัจจุบัน

### 8.2 แก้ข้อมูลทะเบียน

`PUT /api/equipment/:id`

แก้ได้:

- code, name, category, location, serialNumber
- purchaseDate, warrantyEndDate
- maintenanceIntervalHours, nextMaintenanceDate
- note

แก้ไม่ได้:

- branchId
- currentUsageHours
- status
- retirement fields

Request ต้องส่ง `expectedVersion` เพื่อป้องกันการเขียนทับข้อมูลใหม่กว่า

### 8.3 อัปเดตมิเตอร์และสถานะ

`PATCH /api/equipment/:id`

- คง endpoint เดิม
- เพิ่ม `expectedVersion`
- row lock + compare-and-set
- ห้ามลดมิเตอร์และห้ามแก้ `RETIRED`

### 8.4 บันทึกงานบำรุง

`POST /api/equipment/:id/maintenance`

- คง append-only behavior ในรอบ 1
- row lock อุปกรณ์
- ห้ามใช้กับ `RETIRED`
- เพิ่ม `expectedVersion`
- insert maintenance, update equipment และ Audit อยู่ transaction เดียวกัน

### 8.5 เลิกใช้งาน

`POST /api/equipment/:id/retire`

Input:

- `reason`
- `expectedVersion`

Behavior:

- row lock และตรวจ branch/status/version
- เปลี่ยน status เป็น `RETIRED`
- บันทึกเวลาและเหตุผล
- เพิ่ม version
- Audit สำเร็จใน transaction เดียวกัน
- request ซ้ำหลังเลิกใช้แล้วตอบ conflict โดยไม่สร้าง Audit SUCCESS ซ้ำ

## 9. Transaction และ Concurrency

mutation ที่แก้ row เดิมใช้ pattern เดียวกัน:

1. เปิด transaction
2. `SELECT ... FOR UPDATE` ด้วย `id + branchId`
3. ตรวจ lifecycle และ business invariants
4. ตรวจ `expectedVersion`
5. `UPDATE ... WHERE id + branchId + version`
6. ตรวจ `affectedRows === 1`
7. เขียน Audit ใน transaction เดียวกัน
8. commit แล้วจึงตอบ success

หาก version ไม่ตรง ตอบ 409 พร้อมข้อความให้ refresh ข้อมูล ห้ามเขียนทับเงียบ ๆ

## 10. Audit

Actions:

- `EQUIPMENT_CREATED`
- `EQUIPMENT_MASTER_UPDATED`
- `EQUIPMENT_OPERATION_UPDATED`
- `EQUIPMENT_RETIRED`
- `MAINTENANCE_RECORDED`

Audit identity:

- actor คือ authenticated Staff
- branch คือ branch ของ entity ที่ล็อกและตรวจแล้ว
- entityId คือ equipment ID หรือ maintenance ID ตาม action

Metadata allowlist:

- `fields`: รายชื่อ field ที่เปลี่ยน
- `status`: สถานะปลายทาง
- `maintenanceType` และ `maintenanceStatus`
- ไม่เก็บ note, serial number, retirement free-text, ค่าใช้จ่ายละเอียด, token, hash, raw IP หรือ full user-agent

Audit failure ต้อง rollback mutation

## 11. UI/UX

### 11.1 Page structure

- Header และคำอธิบายเดิม
- Summary cards: พร้อมใช้, กำลังบำรุง, งดใช้, เกินกำหนด, เลิกใช้งาน
- Filter/search bar ที่ sync กับ URL
- Tabs: ทะเบียนอุปกรณ์ / ประวัติการบำรุง
- Desktop table และ mobile cards
- Pagination controls พร้อม label และ disabled state
- Empty state แยกกรณีไม่มีข้อมูลกับ filter ไม่พบผลลัพธ์

### 11.2 Equipment detail

Dialog/Sheet แสดง:

- code, name, category, location, serial
- status และ maintenance state แบบข้อความ + icon + badge
- purchase/warranty
- current/next maintenance hours และ dates
- note
- paginated maintenance history

### 11.3 Manage actions

Owner/Manager เห็น:

- เพิ่มอุปกรณ์
- แก้ทะเบียน
- อัปเดตมิเตอร์และสถานะ
- บันทึกงานบำรุง
- เลิกใช้งาน

Counter/Trainer ไม่ render actions เหล่านี้

Retire dialog:

- บอกผลกระทบชัดเจน
- ต้องกรอกเหตุผล
- ใช้ปุ่ม destructive ที่มีข้อความ ไม่ใช้ icon/color อย่างเดียว
- focus trap, Escape, focus restoration และ pending state

### 11.4 Component boundaries

แยก client component เดิมออกเป็นหน่วยที่มีหน้าที่เดียว:

- dashboard summary
- filter bar
- equipment table/mobile list
- history table/mobile list
- detail view
- create/edit dialog
- operation dialog
- maintenance dialog
- retire dialog

ใช้ types/constants ร่วมเท่าที่มีผู้ใช้หลาย component หลีกเลี่ยง abstraction สำหรับการใช้ครั้งเดียว

### 11.5 Accessibility และ visual system

- ใช้ semantic tokens และ components เดิมเพื่อรองรับ Light/Dark
- สีทุกสถานะมีข้อความ/icon กำกับ
- touch target อย่างน้อย 44px
- form มี Label, autocomplete ที่เหมาะสม, field error association และ `aria-live`
- dialog ใช้ keyboard ได้ครบ
- table header/row actions มี accessible name
- animation ไม่จำเป็นต่อการเข้าใจหรือใช้งาน

## 12. Error Handling

- UI แสดงข้อความกลางตาม status และไม่สะท้อน arbitrary server body
- 400 validation, 401 unauthenticated, 403 unauthorized, 404 out-of-scope/not found, 409 version/duplicate/lifecycle conflict, 500 generic unavailable
- mutation failure คืน form ให้แก้ได้และเปิดปุ่มใหม่
- success ปิด dialog, แสดง live feedback และ refresh server data
- ห้าม log request body หรือ raw error object ที่อาจมี SQL params

## 13. Test Strategy

### 13.1 Schema/migration

- enum/columns/indexes ตรง design
- migration ไม่มี destructive SQL
- snapshot/journal ต่อเนื่อง

### 13.2 Service/repository

- maintenance state ทุก boundary
- global duplicate code
- branch scope
- retired lifecycle
- meter monotonicity
- strict calendar dates
- filters/counts/pagination
- lock/version/affectedRows
- rollback เมื่อ insert/update/Audit ล้ม
- concurrent stale request ได้ 409 และไม่เขียน Audit SUCCESS

### 13.3 Route Handlers

- Origin ก่อน body/mutation
- Session/RBAC ทุก role
- branch confinement
- Zod/status mapping
- safe logging/response
- literal protected-route inventory ครอบคลุม endpoints ใหม่

### 13.4 UI

- read-only กับ manage mode
- filter URL state และ pagination
- responsive table/cards
- detail/create/edit/operation/maintenance/retire flows
- pending/success/error/focus/keyboard
- action visibility ตาม permission
- ไม่ render sensitive/unallowlisted error data

### 13.5 Verification

- focused Vitest ตาม slice
- full Vitest
- `tsc --noEmit`
- ESLint
- production build
- `git diff --check`
- secret scan ของ added lines
- browser QA หลัง merge บน port 3005: Owner, Manager, Counter, Trainer, Desktop/Mobile, Light/Dark

## 14. Rollout

1. ทำและ review ใน worktree/branch แยก
2. ตรวจ migration SQL และ preflight database
3. merge หลัง tests/review ผ่าน
4. backup และ migrate ด้วยการอนุมัติแยก
5. restart dev server port 3005 โดยรักษา auth secrets
6. browser QA ตาม role matrix
7. เปิดใช้งานจริงหลัง acceptance criteria ผ่าน

งาน diagnostic Login บน `main` ต้องไม่ถูกนำเข้าหรือเขียนทับโดย branch นี้โดยไม่ตั้งใจ

## 15. Acceptance Criteria

- ข้อมูลเดิมยังอยู่ครบหลัง migration
- ไม่มีเส้นทางลบอุปกรณ์หรือประวัติจริง
- รหัสอุปกรณ์ซ้ำทั้งบริษัทถูกปฏิเสธ
- ทุก role ที่กำหนดเปิดหน้าและเห็นเฉพาะ branch ที่อนุญาต
- Counter/Trainer ไม่มี manage control และ API mutation ตอบ 403
- Owner/Manager เพิ่มและแก้ทะเบียนได้โดยไม่เขียนทับ concurrent update
- มิเตอร์ลดลงและ mutation ต่ออุปกรณ์เลิกใช้ถูกปฏิเสธ
- เลิกใช้ต้องมีเหตุผลและยังดูประวัติได้
- summary/filter/pagination คำนวณจากข้อมูลทั้ง branch อย่างถูกต้อง
- Audit บันทึก actor/branch/entity/action ถูกต้องโดยไม่มีข้อมูลนอก allowlist
- UI ใช้งานได้ด้วย keyboard และรองรับ Mobile/Light/Dark
- automated verification ผ่าน หรือข้อจำกัด environment ถูกบันทึกอย่างตรงไปตรงมา

## 16. Baseline ก่อนเริ่ม implementation

- worktree: `.worktrees/equipment-production-ready`
- branch: `codex/equipment-production-ready`
- dependency install สำเร็จหลังซ่อม generated Rolldown binary ที่เสียจาก install รอบแรกด้วย binary version/checksum เดียวกับ workspace หลัก
- full Vitest: 49/50 files, 286/287 tests; ล้มเฉพาะ bootstrap CLI test ที่ timeout 5 วินาทีภายใต้ full-suite load
- focused `scripts/bootstrap-owner.test.ts`: 1/1 file, 10/10 tests ผ่านใน 3.80 วินาที
- สรุป baseline: ไม่มี functional failure ที่เกี่ยวกับระบบอุปกรณ์; บันทึก load-sensitive timeout เดิมไว้และไม่ขยาย scope ไปแก้ในรอบนี้

