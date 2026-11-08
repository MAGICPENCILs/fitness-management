# LINE Member Link Lifecycle Design

## Intent

เพิ่มวงจรผูกและยกเลิก LINE account กับสมาชิกอย่างพิสูจน์ตัวตนได้ เพื่อเตรียมระบบ notification ให้พร้อมเชิงผลิตภัณฑ์ โดยยังไม่เปิดส่ง LINE จริงจนกว่าจะผ่าน delivery-time privacy checks และ sandbox/provider acceptance

## Goals

- พนักงานที่มี `members.manage` สร้าง challenge สำหรับสมาชิกในขอบเขตสาขาของตนได้
- สมาชิกต้องส่ง command ไปยัง LINE OA เอง; ระบบไม่รับ LINE user ID จาก staff/member JSON
- Webhook ตรวจลายเซ็นบน raw body ก่อน parse และใช้ event จาก direct user เท่านั้น
- Challenge ใช้ครั้งเดียว หมดอายุ 15 นาที หมุนใหม่แล้ว token เดิมใช้ไม่ได้ และไม่เก็บ plaintext token
- LINE user ID หนึ่งผูกได้กับสมาชิกเดียว และสมาชิกหนึ่งมี link/pending challenge ได้หนึ่งรายการ
- พนักงานยกเลิก pending/link ได้ พร้อม audit; privacy withdrawal และ anonymization ล้าง identifier/challenge
- UI แสดงเพียงสถานะ เวลา และ command ที่ issuance response คืนครั้งเดียว ไม่เผย LINE user ID

## Non-goals

- ไม่เปิด LINE channel generation, provider health หรือ push delivery ในรอบนี้
- ไม่เพิ่ม LINE Login, LIFF, member-portal self-service, follow/unfollow automation หรือ reply message
- ไม่เก็บ profile name, picture, raw webhook, signature, reply token หรือ access token
- ไม่ทำ network call ไป LINE และไม่เพิ่ม dependency

## Approaches

### Selected: staff-assisted one-time command + signed webhook

พนักงานสร้าง opaque challenge แล้วให้สมาชิกส่ง `LINK <token>` ไป OA. LINE webhook ที่ลายเซ็นถูกต้องเป็นแหล่งเดียวของ `source.userId`. แนวทางนี้รองรับสมาชิกที่ไม่มี portal account, ไม่ต้องเพิ่ม LINE Login/LIFF และป้องกันการ paste ID ของผู้อื่น

การพิสูจน์นี้ยืนยันว่า sender ควบคุม LINE account และมี bearer challenge เท่านั้น พนักงานมีหน้าที่ตรวจตัวสมาชิกและส่ง challenge แบบส่วนตัว; ผู้ที่ได้รับ token ต่อสามารถ claim ก่อนเจ้าของได้ จึงห้ามแสดงหรือส่ง token ผ่านช่องทางสาธารณะ

### Rejected: staff pastes LINE user ID

เล็กกว่าแต่พิสูจน์ไม่ได้ว่า account เป็นของสมาชิก จึงไม่ผ่าน trust boundary

### Deferred: LINE Login/LIFF account linking

ประสบการณ์ self-service ดีกว่า แต่ต้องมี channel configuration, redirect/origin flow และ provider acceptance เพิ่มเกินขอบเขตรอบนี้

## Data model

สร้าง `member_line_links` แยกจาก `members` เพื่อไม่ให้ whole-row member DTO เผย identifier โดยไม่ตั้งใจ:

- `member_id` primary key/FK → members
- `line_user_id` nullable unique `varchar(33)`; รูปแบบ `U[0-9a-f]{32}`
- `challenge_hash` nullable unique `char(64)`; SHA-256 hex ของ token
- `challenge_expires_at` nullable timestamp
- `initiated_by_staff_id` nullable FK → staff
- `branch_id` FK → branches
- `linked_at`, `created_at`, `updated_at`

Token ใช้ `randomBytes(32).toString("base64url")`; plaintext คืนเฉพาะ POST issuance. การ rotate/link/unlink/privacy mutation lock member ก่อน link row เสมอเพื่อให้ lock ordering คงที่. Unique constraint เป็นตัวตัดสิน concurrent claim; duplicate error ตอบ conflict กลางโดยไม่เผยสมาชิกอื่น

State contract:

- ไม่มี row หรือ challenge หมดอายุ → `UNLINKED`
- challenge ยังไม่หมดอายุและไม่มี identifier → `PENDING`
- มี identifier + `linkedAt` และไม่มี challenge → `LINKED`
- Expiration คำนวณตอนอ่าน ไม่ต้องมี cleanup scheduler
- Linked และ pending อยู่พร้อมกันไม่ได้; POST ขณะ `LINKED` ตอบ 409 โดยไม่ mutation การเปลี่ยน account ต้อง DELETE ที่ยืนยันแล้วก่อน POST ใหม่

## Authorization and staff API

`GET|POST|DELETE /api/members/[id]/line-link`

- โหลด member branch/status ฝั่ง server แล้วตรวจ `members.manage` กับ `member.homeBranchId`
- Owner ข้ามสาขาได้; Manager/Counter เฉพาะ home branch; Trainer ถูกปฏิเสธ
- POST ตรวจ trusted Origin, lock member, ปฏิเสธ CANCELLED และต้องมี current `SERVICE_PRIVACY` consent ภายใต้ lock, สร้าง/rotate challenge อายุ 15 นาที และ audit `LINE_LINK_CHALLENGE_ISSUED`; response เพิ่ม `command` ครั้งเดียว
- GET คืน `{ status: "UNLINKED" | "PENDING" | "LINKED", challengeExpiresAt: string | null, linkedAt: string | null }` เท่านั้นและไม่คืน command/token
- DELETE ตรวจ trusted Origin, lock member, ลบ row ทั้ง pending/link และ audit `LINE_LINK_REMOVED`; absent/expired เป็น idempotent success โดยไม่เขียน removal audit; การกดยกเลิกใน UI ต้อง confirm

## Webhook boundary

`POST /api/line/webhook` เป็น public route **exact path เท่านั้น** แต่ handler เป็น authoritative boundary; ห้ามใช้ prefix allowlist ที่เปิด descendants:

1. จำกัด body สูงสุด 256 KiB ทั้ง `content-length` และ bytes จริง โดยอ่าน stream แบบ bounded และหยุดทันทีเมื่อเกิน limit แม้ header หายหรือโกหก
2. อ่าน raw bytes ครั้งเดียว
3. ต้องมี `NOTIFICATION_LINE_CHANNEL_SECRET`; ขาดค่าให้ fail closed
4. คำนวณ HMAC-SHA256 ด้วย channel secret และเปรียบเทียบ base64 signature แบบ fixed-length `timingSafeEqual`
5. parse JSON หลัง signature ผ่านเท่านั้น
6. validate `destination` รูปแบบ LINE bot ID และถ้ากำหนด `NOTIFICATION_LINE_DESTINATION` ต้องตรงกัน
7. รองรับ empty events ด้วย 200; สำหรับ linking รับเฉพาะ message/text จาก `source.type="user"`, user/destination รูปแบบ `U[0-9a-f]{32}` และ text ตรง `LINK ` + base64url token 43 ตัวอักษรเท่านั้น
8. ประมวลผล relevant events ตามลำดับ payload แยก transaction ต่อ event: lookup hash แบบไม่ lock เพื่อได้ candidate member ID แล้ว transaction lock member → current link row, recheck hash/expiry/branch/status/consent จากนั้นตั้ง unique `lineUserId`, clear challenge และเขียน audit `LINE_LINK_COMPLETED` โดย `actorStaffId:null`; ห้ามอ่าน consent snapshot ใน transaction ก่อน lock member
9. unknown/expired/rotated/consumed challenge, unavailable member/consent, duplicate LINE ownership และ unsupported/malformed event เป็น generic no-op HTTP 200; DB/deadlock/audit infrastructure failure ตอบ generic 500 ให้ LINE redeliver โดย event ที่ commit ก่อนหน้าไม่ rollback และ replay ปลอดภัยจาก consumed challenge
10. invalid signature/malformed envelope/JSON/oversized body/missing secret ตอบ fixed 401/400/413/503 ตามลำดับโดยไม่เผยรายละเอียด

ไม่ใช้ browser Origin check กับ provider webhook และไม่ log raw body/signature/token/user ID/provider response

เอกสาร LINE ทางการที่ใช้เป็น protocol authority:

- https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/
- https://developers.line.biz/en/reference/messaging-api/
- https://developers.line.biz/en/docs/messaging-api/verify-webhook-url

## Privacy and audit

- LINE linking ไม่สร้างหรือเปลี่ยน MARKETING consent
- การถอน `SERVICE_PRIVACY` ลบ `member_line_links` ภายใต้ member lock/transaction เดียวกัน
- anonymization plan เพิ่ม `DELETE` operation สำหรับ link/challengeก่อน `members` operation โดยไม่เปลี่ยน request→member lock ordering เดิม
- Audit metadata มีเฉพาะ member ID, branch, action/status/source enums; ห้ามมี token, hash, LINE ID หรือ payload
- Historical notifications ใช้ privacy cleanup เดิมล้าง recipient/content

## UI/UX

เพิ่มการ์ด “การเชื่อมต่อ LINE” ใน Member Detail โดย reuse card/button/dialog/status patterns และ semantic theme tokens เดิม:

- สถานะมี icon + ข้อความ ไม่ใช้สีอย่างเดียว และรองรับ light/dark mode
- ปุ่มสูงอย่างน้อย 44px, focus ring ชัด, disabled/loading state และ `aria-live` สำหรับผลสำเร็จ/ผิดพลาด
- Pending แสดงเวลาหมดอายุและ command ที่ออกครั้งล่าสุดเฉพาะใน client state; refresh แล้วไม่สามารถดึง token ซ้ำ
- Linked แสดงเวลาเชื่อมต่อ ไม่แสดง LINE ID
- Unlink ใช้ confirmation dialog และ destructive semantic style
- Mobile 375px ไม่เกิด horizontal scroll; command ใช้ wrap/break-all และมีปุ่ม copy ที่มี accessible label

คำแนะนำจาก ui-skills/ui-ux-pro-max ที่ใช้: progressive disclosure, visible status/error recovery, touch target, focus/keyboard, semantic tokens และ dark-mode contrast. ไม่ใช้ palette/font suggestion ใหม่เพราะต้องรักษา design system ของ dashboard เดิม

## Provider-release gate

Outbound LINE ยังคง disabled ที่ generation/settings/UI/health: forced `enableLine=false`, ไม่สร้าง LINE channel/recipient, settings ปฏิเสธ enable และ health unavailable. Provider adapter สามารถ push ได้หากถูกเรียกโดยตรง จึงห้ามเพิ่ม link→recipient wiring และต้องมี test ว่า lifecycle นี้ไม่เรียก delivery. งานถัดไปก่อนเปิดจริงต้อง:

- revalidate current link/member/consent ณ delivery time และ cancel queued LINE recipient หลัง unlink/withdrawal
- ผ่าน sandbox credentials, HTTPS webhook registration, actual signature/redelivery/block behavior และ live push acceptance
- ผ่าน real MySQL uniqueness/locking concurrency test ก่อนเปิด production webhook แม้ outbound ยังปิด เพราะ inbound linking/privacy ใช้ข้อจำกัดนี้แล้ว

## Acceptance

- Migration non-destructive และ Drizzle journal/snapshot สอดคล้อง
- Tests ครอบคลุม role/branch/CSRF, raw-ID injection, missing/invalid/tampered signature, body limit, empty/multi events, expired/rotated/consumed challenge, duplicate LINE association, rollback/audit, privacy withdrawal/anonymization และ no network call
- Component tests ครอบคลุม UNLINKED/PENDING/LINKED, issuance once-only command, copy, confirmation, loading/error, keyboard-accessible controls และ dark-mode token usage
- Outbound LINE gates ยังปิดและ provider health ยังไม่ claim ready
- Full tests, TypeScript, ESLint, Drizzle check และ production build ผ่าน; dev server กลับมาที่ port 3005
