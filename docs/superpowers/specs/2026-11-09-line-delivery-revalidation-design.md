# LINE Delivery-Time Revalidation Design

## Intent

ป้องกันการส่ง notification LINE หาก unlink, เปลี่ยน account, ถอน consent หรือ anonymization มีผลก่อนการอ่านฐานข้อมูลครั้งสุดท้ายที่อนุญาตให้ส่ง โดยไม่เปิด outbound LINE และไม่เปลี่ยน delivery semantics ปกติของ SMS/email

## Scope

- เพิ่ม LINE-only preflight ที่ transactionally revalidate member, current link, recipient equality และ consent ก่อน claim
- เพิ่ม shared transactional cancellation helper สำหรับ unsent LINE rows
- เรียก cancellation จาก unlink, SERVICE_PRIVACY withdrawal และ MARKETING withdrawal ตามชนิด notification
- แก้ anonymization ให้ terminalize unsent notifications ทุก channel พร้อมล้าง PII
- เพิ่ม completion fencing ที่ไม่คืนสถานะหลัง cancellation
- คง generation/settings/UI/health LINE gates ปิดและไม่เพิ่ม migration/dependency/provider call

## Consent and member policy

- `INACTIVITY`: ต้องมี current SERVICE_PRIVACY และ MARKETING consent
- `EXPIRY_REMINDER`: ต้องมี current SERVICE_PRIVACY; MARKETING ไม่เกี่ยวเพราะเป็น operational reminder
- `SCAN_WARNING`: ไม่รองรับ LINE
- ปฏิเสธ member `CANCELLED`; ไม่บังคับ `ACTIVE` เพิ่ม เพื่อไม่เปลี่ยนพฤติกรรม operational reminder ของ FROZEN/EXPIRED โดยเงียบ ๆ
- Stored recipient ต้องตรงกับ current `member_line_links.lineUserId` แบบ exact equality; ห้าม retarget message เก่าไป account ใหม่

## Preflight and dispatch

สำหรับ LINE เท่านั้น:

1. โหลด candidate notification metadata ที่ไม่มีการ log PII
2. ตรวจ settings gate ก่อน adapter; เมื่อ LINE ยัง disabled ให้ terminal policy-skip และไม่เรียก provider
3. ใน transaction lock member → link → notification
4. recheck branch ownership, member status, current link/recipient, notification type/status/attempt eligibility และ required current consents
5. ถ้าไม่ผ่าน ให้ตั้ง terminal cancellation แล้ว commit
6. ถ้าผ่าน ให้ claim เป็น PROCESSING, เพิ่ม attempt, สร้าง claim timestamp หลัง lock และ commit
7. หลัง commit อ่าน claim จากฐานข้อมูลอีกครั้ง ถ้ายังตรงจึงอนุญาตให้ส่งโดยไม่ถือ lock ระหว่าง network call
8. completion update ต้อง match notification ID + PROCESSING + claimedAt + attemptCount เพื่อไม่ overwrite cancellation/reclaim

SMS/email ใช้ claim/delivery flow เดิม ยกเว้น anonymization cancellation ที่เป็น privacy correction ร่วมกัน

## Cancellation contract

Unsent LINE rows ที่ยังส่งได้ (`QUEUED`, `PROCESSING`, `FAILED`, `SKIPPED`) เปลี่ยนเป็น:

- `status = SKIPPED`
- `failureKind = PERMANENT`
- `recipient = null`
- `sentAt = null`
- fixed generic Thai `errorMessage` ที่ไม่มี PII

Rules:

- Unlink: cancel LINE ทุก type ใน member-locked transaction แม้ link row ไม่มีแล้ว
- SERVICE_PRIVACY withdrawal: cancel LINE ทุก type พร้อมลบ link/suspend
- MARKETING withdrawal: cancel LINE `INACTIVITY` เท่านั้น; รักษา link และ `EXPIRY_REMINDER`
- PHOTO actions: ไม่ cancel notification
- Anonymization: ล้าง recipient/title/message/error และ terminalize unsent rows ทุก channel; SENT history คง terminal status แต่ PII ถูกล้าง ก่อนบันทึกรายการที่เตรียมไว้ให้ล็อกและอ่านสถานะสมาชิกปัจจุบันเรียงตาม ID ใน transaction ที่ insert และทิ้งรายการของสมาชิก CANCELLED เพื่อไม่ให้ PII กลับมาหลังล้าง
- Relink/consent grant ไม่ revive cancelled rows

Helper รับ existing transaction, member ID, scope และ fixed reason code; เขียน audit atomically ด้วย metadata allowlist (`source`, `errorCode`, `count`) และไม่ log recipient/link/message/raw error/provider response

## Concurrency boundary

- Member-first lock serialize preflight กับ unlink/consent/link completion; anonymization คง request→member prefix เดิม
- Cancellation ที่ commit ก่อน preflight ต้องเกิด zero provider calls
- Cancellation ที่ commit หลัง claim แต่ก่อนการอ่านฐานข้อมูลครั้งสุดท้ายจะทำให้ไม่เรียก provider
- การอ่าน claim ครั้งสุดท้ายที่ผ่านคือจุดอนุญาตส่ง หลังจากนั้นให้ถือว่าเป็นงาน in-flight: ถ้า withdrawal commit ก่อน adapter เริ่ม ระบบก็ยังอาจเรียก provider ได้ เพราะไม่ได้ถือ lock ระหว่างส่ง การยกเลิกช่วงนี้เป็น best-effort; completion fence ป้องกันการคืนสถานะเท่านั้น ไม่ได้เรียกคืนข้อความ
- Lost provider acknowledgement/lease retry อาจ duplicate เพราะ adapter ยังไม่มี provider idempotency key; คงเป็น external release blocker

## Outbound gate

ยังคง forced `enableLine=false`, settings rejection, omitted LINE generation/recipient และ unavailable provider health. Low-level adapter สามารถ push ได้ถ้าถูกเรียกตรง จึงต้องมี explicit dispatcher gate และ tests ว่า disabled/config/policy state ไม่เรียก adapter

## Acceptance

- Tests ครอบคลุม notification type/consent matrix, missing/pending/malformed/replaced/mismatched link, CANCELLED/branch mismatch, disabled gate, stale/retry claims และ no provider call
- Race tests ครอบคลุมการยกเลิกก่อน/หลังการอ่าน claim ครั้งสุดท้าย รวมถึง withdrawal หลังอ่านแต่ก่อนเรียก adapter, late completion ไม่ overwrite cancellation และ relink ไม่ revive
- Privacy tests ใช้ notification rows จริงใน fixture ยืนยัน cancellation/rollback สำหรับ LINE และ anonymization ทุก channel
- SMS/email ordinary delivery tests ไม่เปลี่ยน; provider permanent policy skip retryไม่ได้
- Full tests, TypeScript, ESLint, Drizzle check, production build และ dev health port 3005 ผ่าน
- Docs ระบุ in-flight/exactly-once/provider/MySQL limitations อย่างตรงไปตรงมา

## External acceptance

Real MySQL isolation/deadlock/concurrency, LINE sandbox credentials, HTTPS webhook, actual push/block/redelivery, provider idempotency และ in-flight behavior ต้องทดสอบภายหลัง ห้ามเปิด outbound LINE จาก local/CI evidence รอบนี้
