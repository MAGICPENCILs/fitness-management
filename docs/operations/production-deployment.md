# Production deployment runbook

คู่มือสำหรับ operator: Next.js 16.4.4 แบบ single-instance Node.js หลัง trusted TLS reverse proxy ใช้พอร์ตภายใน `3005` เท่านั้น ยังไม่ได้เลือก vendor, process manager หรือ reverse proxy จึงไม่มีคำสั่งติดตั้ง infrastructure ในเอกสารนี้ และไม่ได้รับรองว่า production ผ่าน acceptance แล้ว

## Pre-deploy — เงื่อนไขก่อนเริ่ม

1. ระบุผู้รับผิดชอบ deploy/อนุมัติ rollback, maintenance window, เวลาหยุดรับงาน และเกณฑ์ยกเลิกการ deploy หาก gate ใดไม่ผ่านให้หยุด ไม่ข้ามไปขั้นถัดไป
2. ต้องมี GitHub Actions job `quality` สำเร็จสำหรับ commit SHA ที่จะปล่อย เก็บ SHA, CI run ID และ checksum/รหัส artifact ใน release record ที่จำกัดสิทธิ์ ห้าม deploy จาก branch ที่เปลี่ยนได้หรือ working tree ที่มีงานค้าง CI ไม่เชื่อมต่อฐาน production และไม่ใช้ production secret
3. เตรียม release directory แยกจากตัวที่ให้บริการเดิม ใช้ Node.js 20.19+ ในสาย 20 ตาม engine ของ jsdom ที่ล็อกไว้ และใช้ patch version เดียวกับที่ทดสอบผ่าน CI พร้อม lockfile เดียวกัน เก็บ source/artifact เดิมสำหรับ rollback และตรวจว่า dependency/native binary ใช้ได้กับ OS/architecture เป้าหมาย CI นี้ยังไม่ได้ publish deploy artifact อัตโนมัติ
4. ผู้ดูแลต้องยอมรับ topology, TLS, supervisor, monitoring, backup และ restore drill ตามหัวข้อ External blockers ก่อนอนุญาต production

### Release gates

รันใน checkout ของ revision ที่เลือก บน build environment ที่ไม่ชี้ฐานจริง ลำดับต้องตรงกับ `.github/workflows/ci.yml` และทุกคำสั่งต้อง exit 0:

```powershell
npm ci
npm test -- --no-file-parallelism --maxWorkers=1
npx tsc --noEmit
npm run lint
npx drizzle-kit check
npm run build
```

`drizzle-kit check` ตรวจไฟล์ migration ไม่ได้ตรวจว่าฐาน production พร้อมแล้ว หากสร้าง artifact เองต้องบันทึกผล build และ checksum โดยผูกกับ SHA ที่ผ่าน `quality`; ห้าม rebuild ทับ directory ที่กำลังให้บริการ

### Secret และ environment validation

ให้ secret manager inject ค่าเข้า process ของ server และ CLI แต่ละงานโดยตรง ห้ามพิมพ์ secret ลง command line/shell history, repository, CI, log หรือ ticket และห้าม dump environment เพื่อ debug สคริปต์ backup/restore อ่าน `process.env` โดยตรง ไม่ควรสมมติว่าจะโหลด `.env` ให้ เก็บ production URL และรายละเอียด connection ไว้นอก repository/log เช่นกัน

- `NODE_ENV=production`; `DATABASE_URL` ต้องเป็น MySQL target ที่ยืนยันแล้ว; `APP_ORIGIN` ต้องเป็น HTTPS origin ที่ผู้ใช้เข้าจริง ไม่มี path หรือ slash ต่อท้าย
- `AUTH_SESSION_SECRET` และ `AUTH_FINGERPRINT_SECRET` เป็นค่าสุ่มคนละค่าอย่างน้อย 32 bytes; `AUTH_TOTP_ENCRYPTION_KEY` เป็น base64 ของ key สุ่ม 32 bytes เก็บ key เดิมให้กู้คืน TOTP ได้ ห้ามหมุน key โดยไม่มีแผนย้ายข้อมูล
- `BACKUP_ENCRYPTION_KEY` เป็น base64 ของ key สุ่ม 32 bytes แยกการเก็บ key จาก backup; กำหนด `BACKUP_DIRECTORY` บนพื้นที่จำกัดสิทธิ์ที่ไม่ถูกเสิร์ฟผ่านเว็บ
- `ENABLE_DEV_STAFF_SWITCHER=false`, `BACKUP_RESTORE_ENABLED=false`; ไม่คง `BOOTSTRAP_OWNER_PASSWORD` ใน server process การ bootstrap owner เป็นงานแยกที่ได้รับอนุมัติ ไม่ใช่ขั้นตอน deploy ทุกครั้ง
- เปิด `TRUST_PROXY=true` เฉพาะเมื่อ proxy ที่เชื่อถือได้ลบ/แทน forwarded headers จาก client โดยเฉพาะ `X-Forwarded-For` และ backend รับ traffic จาก proxy เท่านั้น มิฉะนั้นใช้ `TRUST_PROXY=false` ห้ามเชื่อ header ที่ client ปลอมได้
- ตั้ง `NOTIFICATION_PROVIDER_MODE=disabled` และ `ACCESS_HARDWARE_MODE=disabled` จนกว่าจะผ่าน sandbox/controller acceptance แล้ว จึงเปิด mode ที่อนุมัติพร้อม secret ตาม [README](../../README.md) ห้ามใช้ simulate กับประตูจริง

ตัวตรวจด้านล่างรันหลัง inject environment ใน PowerShell พิมพ์เฉพาะผลรวม ไม่มีค่าหรือชื่อ host/ฐานข้อมูล ตรวจรูปแบบเบื้องต้นเท่านั้น ไม่พิสูจน์ entropy, target ที่ถูกต้อง หรือ TLS:

```powershell
$validation = @'
let valid = true;
const env = process.env;
const required = ['DATABASE_URL', 'APP_ORIGIN', 'AUTH_SESSION_SECRET', 'AUTH_FINGERPRINT_SECRET', 'AUTH_TOTP_ENCRYPTION_KEY', 'BACKUP_ENCRYPTION_KEY', 'BACKUP_DIRECTORY'];
valid = required.every(name => Boolean(env[name]?.trim()));
valid &&= env.NODE_ENV === 'production' && env.ENABLE_DEV_STAFF_SWITCHER === 'false';
valid &&= env.BACKUP_RESTORE_ENABLED === 'false' && !env.BOOTSTRAP_OWNER_PASSWORD;
valid &&= ['true', 'false'].includes(env.TRUST_PROXY);
valid &&= ['disabled', 'simulate', 'live'].includes(env.NOTIFICATION_PROVIDER_MODE);
valid &&= ['disabled', 'simulate', 'webhook'].includes(env.ACCESS_HARDWARE_MODE);
valid &&= Buffer.byteLength(env.AUTH_SESSION_SECRET || '') >= 32;
valid &&= Buffer.byteLength(env.AUTH_FINGERPRINT_SECRET || '') >= 32;
valid &&= env.AUTH_SESSION_SECRET !== env.AUTH_FINGERPRINT_SECRET;
for (const name of ['AUTH_TOTP_ENCRYPTION_KEY', 'BACKUP_ENCRYPTION_KEY']) {
  const value = env[name] || '';
  valid &&= /^[A-Za-z0-9+/]{43}=$/.test(value) && Buffer.from(value, 'base64').length === 32;
}
try {
  const db = new URL(env.DATABASE_URL);
  const origin = new URL(env.APP_ORIGIN);
  valid &&= db.protocol === 'mysql:' && Boolean(db.hostname && db.username && db.pathname.length > 1);
  valid &&= origin.protocol === 'https:' && origin.origin === env.APP_ORIGIN;
} catch { valid = false; }
console.log(valid ? 'Environment validation passed' : 'Environment validation failed');
process.exitCode = valid ? 0 : 1;
'@
node -e $validation
```

หากตรวจไม่ผ่านให้หยุดและแก้ใน secret manager โดยไม่พิมพ์ค่าออกมา กรณีเปิด provider/hardware จริงต้องตรวจ config ที่เกี่ยวข้องและการเชื่อมต่อแยกต่างหากด้วย

### Photo access model — production blocker

รูปอ่านได้ผ่าน `GET /member-photos/by-member/<memberId>` เท่านั้น: handler ตรวจ authoritative full staff session, สมาชิกปัจจุบันที่ไม่ CANCELLED, PHOTO consent ล่าสุด และสิทธิ์ `members.manage` หรือ `access.manage` ตาม home branch ของสมาชิกทุกครั้ง Owner ข้ามสาขาได้ตาม RBAC เดิม; Trainer และ member portal cookie ไม่มีสิทธิ์ URL filename เดิม `/member-photos/<opaque.ext>` ไม่คืนรูป แม้ DB ยังเก็บ reference แบบเดิมเพื่อ compatibility

Raw roots `/uploads/members` และ `/uploads/privacy-cleanup` รวม nested paths ทุกนามสกุลถูก Proxy ปฏิเสธก่อนอ่าน cookie สำหรับทุก method ทั้งยังปิด `/_next/image` ที่อ้าง raw paths หรือ member-photo gateway กรณีปฏิเสธ/ไม่พบของ gateway ตอบ 404 แบบเดียวกันโดยไม่ redirect; ทุกผลลัพธ์รูปมี `Cache-Control: private, no-store` และ `X-Content-Type-Options: nosniff` ห้าม reverse proxy/static server เปิด directory เหล่านี้หรือ `storage/` โดยตรงและห้าม cache รูปส่วนบุคคล ต้องยืนยันด้วย negative checks ใน Verify ไม่ใช่อาศัย header หรือชื่อไฟล์เดายาก

### Persistent uploads และ recovery set — production blocker

รูปใหม่เขียนที่ `storage/member-photos` และ quarantine ใหม่ที่ `storage/privacy-cleanup` นอก `public` ส่วน `public/uploads/members` และ `public/uploads/privacy-cleanup` ยังต้องเก็บไว้เพื่ออ่าน reference/cleanup token เดิมจนกว่าจะมี migration ที่ตรวจครบ ไม่ย้ายไฟล์อัตโนมัติใน release นี้ DB, `storage/` และ legacy public directories ทั้งสองเป็น recovery set เดียวกัน และ **`npm run db:backup` ไม่ได้สำรองไฟล์เหล่านี้** ต้องจัด persistent mount/permissions และ encrypted snapshot/backup ของทุก directory จับคู่ DB โดยมี restore verification ก่อน production

วาง photo roots และ private quarantine บน filesystem เดียวกันที่รองรับ atomic rename: หากเกิด EXDEV การถอน consent/anonymization จะตอบ 409 โดยไม่ copy/delete ทดแทน ไฟล์ชื่อเดียวกันทั้ง private/legacy จะปิดทั้งการอ่านและการย้าย; ไฟล์ที่สมาชิกอื่นอ้างผ่าน URL alias ยังอ่านได้ตามสิทธิ์แต่หยุดการย้าย/ลบเพื่อรอ operator reconciliation อย่างจำกัดสิทธิ์ ห้ามลบสำเนาหรือแก้ DB เองโดยไม่ตรวจ references/consent และ recovery set

ต้องบันทึก DB artifact, manifest, upload snapshot ID, เวลาที่สอดคล้องกัน และ revision ใน recovery set เดียวกัน หยุดงานเขียนที่เกี่ยวข้องระหว่างจับ snapshot/backup เพื่อไม่ให้รูปกับ reference เหลื่อมกัน คัดลอก recovery set ไป offsite ด้วย encryption, access control และ retention/การลบตาม PDPA แยก key ออกจากข้อมูล ห้ามให้ snapshot/quarantine directory เข้าถึงผ่าน public/static URL โดยตรง

ทดสอบ restore ทั้ง DB และ uploads บน isolated disposable environment ตรวจว่า reference อ่านรูปได้และ privacy-cleanup ไม่สูญหายตาม state ใน DB รวมถึงไม่ทำให้ข้อมูลที่ลบตาม PDPA กลับมาเผยแพร่ เก็บหลักฐานไม่ใส่ PII ห้ามถือว่ามี backup DB อย่างเดียวแล้วกู้ระบบได้ครบ

## Deploy — backup → dry-run → migrate → build/start

1. หลัง release gates ผ่าน ให้หยุดรับ traffic/งานเขียนผ่าน maintenance control ที่ operator เตรียมไว้ รวมงาน background ที่แตะ DB/uploads สำรองและ snapshot จากสถานะเดียวกัน เก็บ release เดิมและ persistent uploads ไว้ ห้ามลบทับ
2. ให้ DBA/ผู้ดูแลอีกคนยืนยัน host, port, database, account และ migration ที่จะรันกับ inventory ผ่านช่องทางปลอดภัย ไม่ใช้เพียงค่าจาก shell เป็นหลักฐาน ห้ามใส่ production URL ลง log พิจารณา SQL/lock/ระยะเวลาของ MySQL DDL ก่อนเริ่ม
3. ใช้ MySQL client ที่มี `mysqldump` และ `mysql` พร้อม transport/TLS ที่ผ่านการยอมรับแล้ว กำหนด `BACKUP_SCHEMA_VERSION` ให้ตรงกับ migration ที่ apply จริงในฐานก่อน deploy จากหลักฐาน DBA: CLI ใช้ tag ล่าสุดใน source journal เป็นค่าเริ่มต้น ซึ่งอาจเป็นรุ่นใหม่ที่ยังไม่ได้ apply จึงห้ามใช้ค่าเริ่มต้นโดยไม่ตรวจ

```powershell
npm run db:backup
```

4. ต้อง exit 0 และได้ทั้ง `.sql.enc` กับ `.sql.enc.manifest.json` (AES-256-GCM + SHA-256 manifest) จัด uploads snapshot เป็น recovery set ตามข้างต้น แล้วคัดลอกไป offsite ตรวจว่าอ่านกลับได้และ retention/access policy ถูกต้อง ชื่อไฟล์ด้านล่างเป็น placeholder ให้แทนด้วยไฟล์ของรอบนี้เท่านั้น:

```powershell
npm run db:restore -- --backup "backups/<file>.sql.enc" --manifest "backups/<file>.sql.enc.manifest.json"
```

ใช้ path ใน `BACKUP_DIRECTORY` จริงถ้าต่างจาก `backups` dry-run เป็นค่าเริ่มต้น ตรวจ manifest/checksum/GCM และชื่อฐานให้ตรงกับ `DATABASE_URL` โดยไม่เชื่อมต่อหรือเขียน DB **ไม่ใช่การ restore SQL เข้า MySQL และไม่ยืนยันว่า host เป็นเป้าหมายที่ถูกต้อง** คำสั่งอาจพิมพ์ชื่อฐาน จึงใช้ restricted operator console ไม่ส่ง stdout นี้เข้า public/CI log

5. หาก backup/offsite copy/uploads snapshot/dry-run หรือ disposable restore drill ยังไม่ผ่าน ห้าม migrate ยืนยัน target อิสระอีกครั้งและให้เฉพาะ migration process รับสิทธิ์ DDL เท่าที่จำเป็น จาก release revision ที่ตรวจแล้วรัน:

```powershell
npx drizzle-kit migrate
```

ต้อง exit 0 หากล้มเหลวให้คง maintenance และให้ DBA ตรวจ actual schema/journal ก่อนตัดสินใจ ห้าม rerun แบบเดาหรือ rollback schema อัตโนมัติ MySQL DDL อาจ commit ไปบางส่วนแล้ว

6. ใช้ artifact ที่สร้างจาก revision ที่ผ่าน gate หรือ build ใน release directory แยกด้วย environment ที่ผ่านการตรวจและไม่เปิดเผย secret:

```powershell
npm run build
```

ต้อง exit 0 และบันทึก artifact/checksum ที่จะ start หาก build ล้มหลัง migration ให้คง maintenance และใช้แผน Rollback ที่ตรวจ schema compatibility แล้ว ห้ามเปลี่ยน SHA ระหว่างขั้นตอน

7. Drain instance เดิม: หยุดรับ request ใหม่ ส่ง `SIGTERM` หรือ `SIGINT` ให้ Node server ผ่าน supervisor ที่เลือก ให้เวลาจบ in-flight requests/`after()` **10–30 วินาที** ก่อน force stop และตรวจว่า signal ไปถึง Node ไม่ติดอยู่ที่ npm wrapper ต้องทดสอบกับ platform จริง ไม่ใช้ `next dev` หรือเพิ่ม custom signal handler โดยไม่จำเป็น
8. ให้ supervisor เปิด release ใหม่ด้วย working directory ที่ถูกต้อง (path uploads อิง `process.cwd()`), persistent upload mounts/permissions และ production environment:

```powershell
npm run start
```

คำสั่งนี้คือ `next start -p 3005` ไม่ใช่ daemon/supervisor ในตัว ให้ operator ตั้ง restart policy, startup-after-reboot, resource limits และ log destination แบบไม่บันทึก secret/PII ปิดพอร์ต `3005` จากอินเทอร์เน็ตด้วย network policy อนุญาตเฉพาะ reverse proxy/monitor ที่กำหนด

## Verify — ก่อนคืน traffic

- ตรวจ process/TCP `3005` เป็น **liveness** เท่านั้น ไม่ใช้ความล้มเหลวของ DB เป็นเหตุ restart loop
- เรียก readiness ภายใน: `Invoke-WebRequest -Uri 'http://127.0.0.1:3005/api/health'` ต้อง HTTP 200 พร้อม `status: "ok"`, database/schema `"ok"` ตรวจซ้ำผ่าน HTTPS origin จริงจาก monitoring ที่เก็บ URL ไว้นอก repository/log ก่อนคืน traffic
- `/api/health` คืน HTTP 503 เมื่อ schema outdated (`degraded`) หรือ DB ใช้งานไม่ได้ (`unavailable`) ห้ามนำเข้ารับ traffic สถานะ READY เทียบ journal เท่านั้น ไม่ใช่ full schema/data integrity หรือ provider/hardware acceptance
- Smoke login/logout ด้วยบัญชี operator/test ที่อนุมัติ (รวม 2FA ตามบัญชี) แล้วอ่าน fixture ที่มี PHOTO consent ผ่าน `/member-photos/by-member/<memberId>`: Owner และ Manager/Counter สาขาเดียวกันได้ bytes; ไม่มี cookie, forced-password/revoked session, Trainer, member cookie, พนักงานต่างสาขา, ไม่มี PHOTO consent หรือสมาชิก CANCELLED ต้องได้ 404/body เดียวกัน ไม่มี redirect และ privacy headers เหมือนกัน ตรวจ private file และ legacy fallback โดย **ไม่แก้ข้อมูลสมาชิกจริง ไม่ upload/ลบรูปจริง ไม่ส่ง notification หรือเปิดประตูจริง** login อาจสร้าง session/audit ตามปกติ
- ทำ **negative direct-URL checks** สำหรับ raw roots/nested `/uploads/members` และ `/uploads/privacy-cleanup`, filename gateway เดิม และ `/_next/image?url=...` ของ raw/protected gateway ด้วย fixture ที่มีอยู่จริง ทั้ง extension และ extensionless ผ่าน TLS proxy และ backend ที่เข้าถึงได้ในเครือข่ายควบคุม ทุกกรณีต้อง 404 ไม่คืน bytes หรือ redirect สำหรับ anonymous และบัญชีทุก role รวม Owner ทดสอบ GET และ HEAD พร้อม headers ทำซ้ำ **หลัง restart** โดย fixtures อยู่ก่อน start เพราะ Next.js index `public` ตอนเริ่ม process หากรั่วทางเดียวให้ block production; positive smoke/login redirect ไม่พิสูจน์ privacy เก็บหลักฐานในช่องทางจำกัดสิทธิ์ไม่ส่งเข้า log สาธารณะ
- เมื่อทั้งหมดผ่านจึงคืน traffic และเฝ้าดู readiness, error rate, latency, DB pool, disk/uploads capacity และ restart count ตาม monitoring window ที่อนุมัติ เก็บเฉพาะหลักฐานที่ไม่มี secret/PII หากไม่ผ่านให้หยุดและใช้ Rollback

## Rollback — source/artifact ไม่ใช่ schema

1. เมื่อ start/readiness/smoke ไม่ผ่าน หรือ error เกินเกณฑ์ที่อนุมัติ ให้ปิด traffic/งานเขียนและเก็บ incident evidence ที่ redacted แล้ว Drain instance ใหม่ด้วยขั้นตอน 10–30 วินาทีเดิม
2. ตรวจโดย DBA ว่า source/artifact เดิมเข้ากับ schema ปัจจุบันได้ก่อนสลับกลับ ใช้ revision/artifact เดิมที่บันทึกไว้พร้อม working directory, environment และ persistent uploads เดิม ไม่คัดลอกไฟล์ build ทับ instance ที่ยังทำงาน
   **Rollback exposure:** revision ก่อน protection อาจเปิด filename/raw legacy URLs อีกครั้งและอ่าน private files ไม่ได้ ห้ามคืน traffic ให้ revision ดังกล่าวจนกว่าจะมีการปิด raw/filename/optimizer paths ที่ edge และ authenticated gateway ที่ผ่าน Verify คง maintenance หากยืนยันไม่ได้ ห้ามคัดลอก private photos กลับ `public` เพื่อแก้ compatibility
3. **ห้าม blind schema rollback หลัง MySQL DDL** และห้าม restore DB เก่าทับ production เพื่อแก้ deployment โดยอัตโนมัติ เพราะอาจทำให้ข้อมูลหลัง backup หาย หาก schema ไม่เข้ากับโค้ดเก่าให้คง maintenance และให้ DBA เลือก forward fix หรือ recovery ที่อนุมัติอย่างชัดเจน
4. การ recovery จริงต้องยืนยัน target และขอบเขตข้อมูลสูญหาย/RPO, หยุด writers และกู้ DB พร้อม `storage/` และ legacy uploads ทั้งสอง directory จาก recovery set เดียวกันผ่านแผนที่ซ้อมแล้ว ดู guard `BACKUP_RESTORE_ENABLED=true`, `--execute`, `--confirm "RESTORE <database>"` ใน [README](../../README.md) เปิด flag ชั่วคราวเฉพาะ restore process แล้วล้างทันที ไม่เปิดค้างใน server environment
5. Restore drill ต้องใช้ **isolated disposable MySQL server ที่ใช้ชื่อ database เดียวกับ manifest** เพราะสคริปต์บังคับชื่อตรงกัน เปลี่ยน host ผ่าน secret manager ตรวจแยกจาก production และห้ามแก้ manifest เพื่อข้าม guard; dry-run อย่างเดียวไม่ทดแทน drill
6. หลัง rollback/recovery ต้องผ่าน Verify อีกครั้งก่อนคืน traffic บันทึก revision ที่ให้บริการจริง, schema state และ recovery set โดยไม่เก็บ secret/ข้อมูลสมาชิกลง incident log

## External blockers — ต้องมี operator acceptance ก่อน production

- Photo privacy/access ต้องผ่าน authenticated gateway และ negative raw/filename/optimizer checks ทั้งก่อนและหลัง restart ตาม Verify; ห้ามอนุมัติ public capability URL เป็นข้อยกเว้นหรืออ้าง photo RBAC จาก positive smoke/generic login
- Reverse proxy/TLS topology: certificate/renewal, forwarded-header replacement, private backend port, request limits, streaming, ไม่ cache response ส่วนบุคคล และต้องป้องกัน raw uploads/quarantine ตามผล negative checks ไม่ใช่สมมติว่า app มี authorization ครบแล้ว
- MySQL network/CA/TLS เมื่อฐานอยู่ remote: ตรวจ certificate chain และ hostname สำหรับ runtime, Drizzle migration และ MySQL backup/restore clients แยกกัน โค้ดปัจจุบันไม่ได้กำหนด CA/verify policy ครบทุกเส้นทาง และ backup parser ไม่ส่งต่อ TLS query options จาก URL ห้ามถือว่าใส่ URL แล้วได้ TLS ที่ตรวจสอบแล้ว หรือปิด verification เพื่อให้ผ่าน หากพิสูจน์ transport ที่ปลอดภัยไม่ได้ให้ block deploy และออกแบบ/อนุมัติงานเพิ่ม
- Process supervisor/platform: restart policy, signal propagation, drain 10–30 วินาที, reboot recovery, resource limits และ working directory/mounts ต้องเลือกและซ้อมบน host จริง
- Persistent `storage/` และ legacy uploads ทั้งสอง directory + encrypted paired DB backup, same-filesystem rename, offsite storage, retention, key custody/access control และ disposable full restore drill ยังต้องจัดเตรียมโดย operator; สคริปต์ DB ไม่ครอบคลุมไฟล์
- Monitoring/alert owner และ log destination ต้องยืนยันว่า readiness failure, error/latency, restart, disk และ backup failure ส่งถึงผู้รับผิดชอบได้ โดยไม่เก็บ credential/PII หรือ production URL ใน log
- Hardware/controller และ notification provider ต้องมี sandbox/อุปกรณ์จริง acceptance, consent และ failure handling ก่อนเปิดใช้งานจริง CI/build ไม่ใช่หลักฐานทดแทน
- รองรับ **single instance เท่านั้น** จนกว่าจะออกแบบและยอมรับ shared uploads, centralized sessions/rate limits ในส่วนที่ยังเป็น process-local (เช่น privacy rate limit), shared cache/keys และ deployment platform ครบ ห้ามเพิ่ม replicas หรือ rolling multi-instance จาก runbook นี้โดยตรง

อ้างอิงพฤติกรรมจาก `package.json`, `.github/workflows/ci.yml`, `scripts/backup-database.ts`, `scripts/restore-database.ts`, `lib/backup/index.ts`, `app/api/health/route.ts` และคู่มือที่ติดตั้ง `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md` โดยไม่มีการ deploy, ต่อฐานจริง หรือรับรอง external infrastructure ในงานเอกสารนี้
