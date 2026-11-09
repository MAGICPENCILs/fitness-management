# LINE Provider Settings Design

## Intent

ให้ Owner กรอก LINE Channel Secret, Access Token และ Destination/Bot ID จากหน้า Settings โดยไม่เก็บ secret แบบ plaintext และไม่ส่ง secret กลับ browser/log/audit พร้อมลด environment ที่ต้องดูแลเหลือ master encryption key หนึ่งค่า ทั้งนี้การบันทึก credential ต้องไม่เปิด outbound LINE

## Approaches

1. เก็บทุก credential ใน deployment secret manager และให้ Settings แสดงสถานะอย่างเดียว — ปลอดภัยที่สุดแต่ไม่ตรงคำขอให้แก้จากหน้าเว็บ
2. ตาราง LINE แยก + encrypted write-only credentials + external master key — เลือกแนวทางนี้ เพราะแยก global secret authorization ออกจาก notification rule DTO เดิมและไม่เพิ่ม provider framework
3. ขยาย `notification_settings` เดิม — โค้ดน้อยกว่าแต่ GET ปัจจุบันคืนทั้ง row, Manager มีสิทธิ์แก้ singleton global และ secret จะปนกับ rule form จึงไม่ใช้

## Scope

- เพิ่ม singleton `line_provider_settings` แยกจาก `notification_settings`
- เพิ่ม permission `provider.credentials.manage` สำหรับ OWNER เท่านั้น
- เพิ่ม service/API `/api/notification-provider-settings` ที่คืนเฉพาะ safe metadata DTO และ mutation ตรวจ trusted Origin
- เพิ่ม Owner-only card ในหน้า Notification Settings; Manager เห็น provider health เดิมแต่ไม่เห็น credential form/destination
- ใช้ DB channel secret/destination ตรวจ webhook; ถ้ายังไม่มี DB row ให้ fallback env เดิมเพื่อ backward compatibility
- เก็บ Access Token ไว้สำหรับ release ถัดไป แต่ไม่เชื่อม generation/delivery และไม่เปลี่ยน `UNAVAILABLE`
- ไม่เพิ่ม test-send, provider verification call, provider mode editor, SMS/SMTP editor หรือ outbound enablement

## Data and encryption

Singleton row `id=1` มี nullable `accessTokenEncrypted`, `channelSecretEncrypted`, non-null `destination`, integer `revision`, updater staff ID และ timestamps. การมี row หมายถึง DB authoritative; nullable secret คือ clear จริงและห้าม fallback ไป env เดิม ส่วนไม่มี row เท่านั้นที่ใช้ env fallback. DB row ต้องมี pinned destination เสมอ; ห้ามสร้าง secret-only/unpinned row

`PROVIDER_CONFIG_ENCRYPTION_KEY` เป็น base64 ของ key สุ่ม 32 bytes และต้องอยู่นอก DB/backup. ใช้ AES-256-GCM จาก `node:crypto`, random IV 12 bytes, envelope `v1.iv.tag.ciphertext`, และ AAD ผูก `line_provider_settings:1:<field>:v1` เพื่อกันสลับ ciphertext ระหว่าง token/secret. ห้าม reuse session, fingerprint, TOTP, backup หรือ LINE secret เป็น master key

Key หายหรือผิดต้อง fail closed. รุ่นแรกไม่มี online key rotation; ต้องมี old-key controlled re-encryption/re-entry plan ก่อนเปลี่ยน master key และต้องเก็บ key คู่กับอายุ backup ตาม retention

## API contract

GET/PATCH ต้อง `Cache-Control: private, no-store`. Safe DTO:

```ts
type LineProviderSettingsDto = {
  source: "DATABASE" | "ENVIRONMENT" | "NONE";
  revision: number;
  destination: string | null;
  accessTokenConfigured: boolean;
  channelSecretConfigured: boolean;
  updatedAt: string | null;
  webhookUrl: string;
  outboundEnabled: false;
};
```

PATCH input ใช้ omitted = คงเดิม, non-empty secret = replace, `clearAccessToken/clearChannelSecret=true` = clear; replacement กับ clear พร้อมกันเป็น 400. Blank/whitespace/control character/oversize เป็น 400 ไม่ใช่ clear. `revision` ต้องตรง current revision มิฉะนั้น 409. Response ไม่มี plaintext, ciphertext, suffix, hash หรือ provider body

สร้าง DB row ครั้งแรกจาก env fallbackได้เฉพาะเมื่อ Owner ส่ง destination และ operation ของ secret ทั้งสอง field อย่างชัดเจน: replacement value หรือ explicit clear; omission เป็น 400 เพื่อไม่ทำให้ env credential หายเงียบ ๆ และห้าม auto-import secret จาก env. หาก env มี destination ค่าใหม่ต้องตรงกันเมื่อมี lifecycle data; หาก env ไม่มี pinned destination แต่มี lifecycle data ให้ปฏิเสธ cutover เพราะพิสูจน์ OA เดิมไม่ได้

Destination เปลี่ยนไม่ได้เมื่อมี linked member, challenge ที่ยังไม่หมดอายุ หรือ unsent LINE row. Expired challenge ที่ไม่มี `lineUserId` ไม่ block และ service ลบได้ใน transaction ก่อนประเมิน guard. Same-destination token/secret rotation ทำได้. ห้าม clear destination ผ่าน UI

หาก master key หาย/ผิด/tampered ciphertext ให้ GET แสดง fixed unavailable state และ PATCH ปกติ fail closed ก่อนแก้ข้อมูล. รุ่นแรกไม่มี partial recovery ใน UI เพราะเสี่ยง mixed-key ciphertext; operator ต้อง restore key เดิม หรือใช้ reviewed full-row reset/re-entry procedureใน maintenance window

Audit บันทึกเฉพาะ fixed action/result, `source: "LINE"`, fixed status และ revision; ห้าม field names/values, fingerprint, ciphertext, destination, raw validation/storage error

## UI and accessibility

- ใช้ uncontrolled password inputs/FormData; ไม่เก็บ secret ใน React state, storage หรือ URL
- stored secret แสดงเพียง “ตั้งค่าแล้ว/ยังไม่ตั้งค่า”; input เริ่มว่างเสมอและ reset หลัง success/error
- Destination แสดงเฉพาะ Owner; webhook URL เป็น read-only selectable text พร้อม Copy button และ live feedback
- Replace และ Clear แยก action; Clear ใช้ house Dialog ยืนยันและคืน focus
- visible labels, `aria-describedby`, `aria-invalid`, `aria-busy`, status/alert text; semantic tokens รองรับ dark mode และ 44px controls
- ข้อความคงที่ชัดเจนว่า “บันทึกเพื่อเตรียมระบบเท่านั้น การส่ง LINE ยังปิด”

## Runtime and bot identity

Webhook resolver อ่าน DB row/decrypt ถ้ามี มิฉะนั้น fallback `NOTIFICATION_LINE_CHANNEL_SECRET` และ `NOTIFICATION_LINE_DESTINATION`. DB row ที่ missing/decrypt failure ตอบ 503 แบบ fixed messageและห้าม fallback env; invalid signature 401 เดิม. Public route exact-path/bounded raw body/signature-before-parse คงเดิม

หลัง DB cutover/verification operator ต้องถอด legacy LINE env credentials ออกจาก deployment. Rollback ไป artifact ที่ยังไม่รู้จัก DB config ต้องปิด webhook ที่ reverse proxy หรือใช้ environment ที่ไม่มี legacy secret เพื่อไม่ให้ credential ที่ clear/rotate แล้วกลับมาทำงาน

Access Token ยังไม่ถูกส่งออก network และไม่ทำให้ health READY. การ validate tokenด้วย LINE bot-info, signed webhook verification status, actual push, HTTPS registration, block/redelivery/idempotency และ real MySQL concurrency เป็น release gates แยก

## Migration, backup and recovery

เพิ่ม additive migration `0019_line_provider_settings`. Migration ไม่ seed/import credentials. Encrypted DB backup ครอบคลุม ciphertext แต่ `PROVIDER_CONFIG_ENCRYPTION_KEY` ต้อง backup แยก; restore ที่ไม่มี key ใช้ credential ไม่ได้และต้อง restore key เดิมหรือทำ reviewed full reset/reissue. Staging restore ต้องคง outbound disabled

## Acceptance

- encryption tamper/wrong key/AAD field swap fail closed; plaintext ไม่อยู่ใน ciphertext/DTO/log/audit
- unauthenticated/Manager/wrong Origin ถูกปฏิเสธก่อน body/storage
- preserve/replace/clear/revision rollback และ bot-switch guards มี tests ด้วย stored rows
- webhook ใช้ DB secret/destination และ env fallback เฉพาะเมื่อ row ไม่มี; zero provider calls
- UI secret inputs ว่างเสมอ, reset, accessible, dark-mode token-driven และ Manager ไม่ได้รับ provider props
- existing LINE generation/settings/UI health/delivery gates ยังปิด
- full tests, TypeScript, ESLint, Drizzle, backup/dry-run, migration, build, dev health port 3005 และ hosted CI ผ่าน

## External limits

DB encryption ป้องกัน DB-only theft แต่ไม่ป้องกัน compromised app host หรือ Owner account. Real LINE credential validity, webhook delivery และ outbound acceptance ยังไม่รับรองจาก local/CI
