# Task 9 Report: Admin Security page

## ขอบเขตที่ส่งมอบ

- เพิ่ม `/settings/security` ซึ่งตรวจ `auth.security.read` จาก authoritative session ก่อน query และลดรูป `searchParams` แบบ Promise ตาม Next.js 16.2
- เพิ่ม semantic tabs สำหรับเซสชัน, Rate limit และเหตุการณ์ Login พร้อม Arrow/Home/End, URL tab/filter/page state และ manual refresh
- แสดง Sessions แบบตาราง desktop และ card mobile; แสดง status พร้อมข้อความ, device category และ fingerprint ย่อ
- เพิ่ม confirmation dialogs สำหรับ revoke ราย session, revoke ทุก session ของ Staff และ clear rate limit โดยใช้ `manageable` จาก server, ระบุเป้าหมาย/ผลกระทบ, pending/error/live feedback และคืน focus
- แสดง unknown actor/branch ด้วย “ไม่ทราบบัญชี” / “ไม่ทราบสาขา” และกรอง metadata ซ้ำที่ display boundary
- เพิ่ม Sidebar item “ความปลอดภัย” เฉพาะ `auth.security.read` โดยรักษา active-route behavior เดิม

## TDD lifecycle

1. RED แรก: SecurityConsole module ยังไม่มีและ Sidebar security item assertion ล้มเหลวตามคาด
2. GREEN UI: component/page/sidebar รวม 10 tests ผ่าน
3. RED validation: fractional page และ Infinity Staff ID หลุดเข้า service
4. GREEN validation: รับเฉพาะ safe positive integers และ exact calendar dates
5. RED secret regression: unsafe extra event metadata ถูก render
6. GREEN redaction: display allowlist และ fingerprint รูปแบบย่อเท่านั้น

## Accessibility / responsive

- `tablist` / `tab` / `tabpanel` เชื่อมด้วย `aria-controls` และ `aria-labelledby`
- controls สำคัญสูงอย่างน้อย 44px, มี visible focus styles และ icon ตกแต่ง `aria-hidden`
- Radix dialog trap focus/Escape และคืน focus ไป trigger; pending ใช้ `aria-busy`, disabled controls และ live regions
- Sessions ใช้ semantic table บน desktop และ cards ที่ 375px; container/page ใช้ `min-w-0` เพื่อไม่ดัน page overflow
- Empty states แยกตาม tab และ mutation errors ไม่หายไปกับ toast

## Verification

- Focused UI/page/sidebar: 3 files, 14 tests passed
- `tsc --noEmit`: passed
- Focused ESLint: passed
- `git diff --check`: passed
- Production secret scan: Security UI ไม่อ้าง session token/hash, subject hash, raw IP หรือ Staff code
- Single capped `next build`: ไม่ผ่านเพราะ environment เชื่อม `fonts.googleapis.com` เพื่อโหลด Geist ไม่ได้; ไม่ใช่ TypeScript/UI compile error และไม่ rerun ตาม cap

## Deferred

- Browser QA และ full-suite/build ที่มี network พร้อมทำใน final verification Task 11
- ไม่เพิ่ม Task 10 development switcher หรือ backend/migration ใด ๆ
