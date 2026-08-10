# Login, Session และ Authentication Security Design

**วันที่:** 10 สิงหาคม 2026  
**สถานะ:** อนุมัติแบบแล้ว  
**ขอบเขต:** Login/Logout, password lifecycle, database session, Proxy guard, Staff/RBAC integration, Login rate limit, authentication audit และหน้า Admin Security

## 1. เป้าหมาย

แทนที่ `fitness_staff_id` cookie และ Staff Switcher แบบจำลองด้วยการยืนยันตัวตนจริงที่ผูกกับบัญชี `staff` เดิม ผู้ใช้ต้อง Login ด้วย `staff_code` และรหัสผ่านก่อนเข้าระบบ ทุก request ที่อ่านหรือแก้ข้อมูลต้องตรวจ session กับฐานข้อมูลและตรวจ RBAC ใกล้ data source เสมอ ระบบต้อง revoke session ได้ทันทีเมื่อ Logout ปิดบัญชี เปลี่ยน role/branch หรือเปลี่ยนรหัสผ่าน และต้องมีหลักฐาน audit สำหรับ Login, Logout, Login ไม่สำเร็จ, password lifecycle และการจัดการ security state

## 2. ข้อกำหนดและสมมติฐาน

- ใช้ Next.js 16.2.11, React 19, Drizzle ORM, MySQL, Tailwind CSS และ shadcn/ui ตามระบบเดิม
- Development และ production server ใช้ port `3005`
- อ่านคู่มือ authentication และ `proxy.ts` ใน `node_modules/next/dist/docs/` ก่อน implementation
- Function และ business rule ที่เพิ่มหรือแก้ต้องมี comment ภาษาไทยซึ่งอธิบายเหตุผล เงื่อนไขสำคัญ และผลข้างเคียง
- ระบบ production ต้องทำงานหลัง trusted reverse proxy หากเปิด rate limit ตาม IP; application จะเชื่อ header ของ proxy เฉพาะเมื่อ configuration ระบุชัดเจน
- ต้องกำหนด `AUTH_SESSION_SECRET`, `AUTH_FINGERPRINT_SECRET` และ `APP_ORIGIN` ใน production; ระบบ auth ต้อง fail closed หากค่าขาดหรือไม่ผ่านเกณฑ์ความยาว โดยห้าม fallback เป็นค่าใน source code
- `TRUST_PROXY=true` ใช้ได้เฉพาะ deployment ที่ reverse proxy เป็นผู้เขียนและล้าง forwarded IP header ให้เชื่อถือได้
- ไม่รวม self-registration, forgot-password ผ่านอีเมล, MFA, SSO, social login, cron cleanup และ device trust ในรอบนี้

## 3. แนวทางที่เลือก

ใช้ hybrid database session:

1. รหัสผ่านเก็บเป็น Argon2id hash
2. หลัง Login สร้าง session ID แบบสุ่มที่มี entropy เพียงพอ
3. Cookie มี session ID และ claims ขั้นต่ำ ได้แก่ staff ID, role, home branch, session mode และ absolute expiry พร้อมลายเซ็นจาก server secret
4. ฐานข้อมูลเก็บเฉพาะ SHA-256 hash ของ session ID
5. `proxy.ts` ตรวจลายเซ็นและ claims เพื่อทำ optimistic redirect
6. Data Access Layer, Server Component, Route Handler และ service ตรวจ session กับฐานข้อมูลและ Staff/RBAC ปัจจุบันอีกครั้ง

ไม่ใช้ JWT แบบ stateless เพราะ Logout, revoke, idle timeout และการปิดบัญชีต้องมีผลทันที ไม่ใช้ authentication framework ในรอบนี้เพราะจะเพิ่ม schema และ convention ที่ซ้ำกับ Staff/RBAC เดิมเกินความจำเป็น

## 4. แบบจำลองข้อมูล

### 4.1 `staff`

เพิ่มคอลัมน์:

- `password_hash` nullable เพื่อให้ migration ผ่านข้อมูลเดิมได้; บัญชีที่ไม่มี hash Login ไม่ได้
- `password_changed_at` nullable
- `must_change_password` boolean ค่าเริ่มต้น `true`

ห้าม select หรือส่ง `password_hash` ไป DTO ฝั่ง client หน้า Staff ปกติต้องไม่อ่าน hash หากไม่จำเป็นต่อ operation

บัญชีเดิม `OWNER001` ได้รหัสผ่านผ่าน bootstrap command หลัง migration ส่วนบัญชีเดิมอื่นต้องให้ Owner/Manager reset รหัสผ่านก่อน Login บัญชี Staff ที่สร้างใหม่ต้องมีรหัสผ่านชั่วคราวและ `must_change_password=true`

### 4.2 `auth_sessions`

- `id`
- `staff_id` foreign key ไป `staff`
- `session_token_hash` unique
- `mode`: `FULL` หรือ `PASSWORD_CHANGE_REQUIRED`
- `created_at`, `last_seen_at`
- `absolute_expires_at`
- `idle_expires_at`
- `revoked_at`, `revoked_reason` nullable
- `ip_fingerprint`, `user_agent_category` nullable

สถานะที่ UI แสดงคำนวณตามลำดับ `REVOKED`, `EXPIRED`, `IDLE_EXPIRED`, `ACTIVE` จาก field จริงขณะ query จึงไม่ต้องพึ่ง background cleanup

### 4.3 `auth_login_limits`

- `id`
- `scope`: `ACCOUNT` หรือ `IP`
- `subject_hash` เป็น HMAC fingerprint และ unique ร่วมกับ `scope`
- `attempt_count`
- `window_started_at`
- `locked_until` nullable
- `updated_at`

ห้ามเก็บ staff code ที่กรอกผิดหรือ IP address ดิบ ตารางนี้เป็น persistent database rate limit เพื่อรองรับหลาย application instance

### 4.4 `audit_logs`

ปรับ `actor_staff_id` และ `branch_id` เป็น nullable เพื่อรองรับเหตุการณ์จากผู้ที่ยังยืนยันตัวตนไม่ได้ และเปลี่ยนหน้า audit เป็น left join กับ Staff/Branch เหตุการณ์ที่ระบุ Staff ได้ยังต้องผูก Staff และ branch ตามจริง เหตุการณ์ไม่ทราบบัญชีแสดงเฉพาะ Owner

## 5. Password lifecycle

### 5.1 Password policy

- ขั้นต่ำ 12 ตัวอักษร
- มีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และอักขระพิเศษอย่างน้อยประเภทละ 1 ตัว
- Validation ฝั่ง client มีไว้ช่วยผู้ใช้ แต่ server ต้องตรวจซ้ำเสมอ
- Password, hash และ temporary password ห้ามเข้า log, audit metadata, URL หรือ process argument

### 5.2 Bootstrap Owner

เพิ่มคำสั่ง `npm run auth:bootstrap-owner` ซึ่ง:

- ทำงานเฉพาะ Staff code `OWNER001`
- อ่าน plaintext จาก `BOOTSTRAP_OWNER_PASSWORD`
- validate policy และ hash ก่อนเขียนฐานข้อมูล
- ตั้ง `must_change_password=false` เพราะเป็นรหัสถาวรที่ Owner กำหนดเอง
- ปฏิเสธการเขียนทับหากมี hash แล้ว เว้นแต่กำหนด environment flag ยืนยันการ rotate
- revoke session ทั้งหมดเมื่อ rotate และไม่แสดง plaintext ใน output

### 5.3 Staff create และ Admin reset

- การสร้าง Staff ต้องรับ temporary password และ confirmation ใน request เดียวกัน
- Temporary password ถูก hash ใน service และไม่รวมใน response/audit
- Owner reset ได้ทุก Staff; Manager reset ได้เฉพาะ Staff ที่ไม่ใช่ Owner ใน home branch ของตน
- Reset ตั้ง `must_change_password=true`, revoke session ทั้งหมดของเป้าหมาย และเขียน `PASSWORD_RESET`
- Dialog ต้องยืนยันเป้าหมายก่อน reset และไม่เก็บ temporary password ไว้หลังปิด dialog

### 5.4 Forced password change

- Login ด้วยบัญชี `must_change_password=true` สร้าง session mode `PASSWORD_CHANGE_REQUIRED`
- Session mode นี้เข้าได้เฉพาะ `/change-password`, Logout และ endpoint ที่จำเป็นต่อ flow
- เปลี่ยนสำเร็จจะ update hash, ตั้ง `must_change_password=false`, revoke session เดิม และสร้าง `FULL` session ใหม่
- เขียน `PASSWORD_CHANGED` โดยไม่เก็บ field รหัสผ่าน

## 6. Login, Session และ Logout flow

### 6.1 Login

1. ตรวจ Origin, content type และ Zod schema
2. Normalize `staff_code` เป็นตัวพิมพ์ใหญ่
3. ตรวจ ACCOUNT และ IP rate-limit bucket
4. Query Staff แบบเจาะจง field ที่จำเป็น
5. ใช้ dummy Argon2id hash แม้ไม่พบบัญชี เพื่อทำให้ timing ใกล้เคียงกัน
6. ตรวจ status, password และ lock state โดยตอบข้อความกลางเดียวกันเมื่อ credential ไม่ถูกต้อง
7. เพิ่ม failed counter แบบ atomic เมื่อไม่สำเร็จและเขียน audit
8. เมื่อสำเร็จให้ล้าง ACCOUNT bucket, สร้าง database session, ตั้ง cookie, เขียน `LOGIN_SUCCESS` และ redirect ไป safe relative return path หรือ `/`

ข้อความ credential failure คือ “รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง” ข้อความ rate limited คือ “ไม่สามารถเข้าสู่ระบบได้ชั่วคราว กรุณาลองใหม่ภายหลัง” และต้องไม่ระบุว่าบัญชีมีอยู่จริงหรือเวลาปลดล็อกแบบเจาะจง

### 6.2 Rate limit

- ACCOUNT: ผิด 5 ครั้งภายใน 15 นาที ล็อก 15 นาที
- IP: ผิด 20 ครั้งภายใน 15 นาที ล็อก 15 นาที
- Login สำเร็จล้าง ACCOUNT bucket แต่ไม่ล้าง IP bucket ทั้งหมด
- เมื่อพ้น window โดยไม่ locked ให้เริ่ม counter ใหม่
- เมื่อพ้น `locked_until` ให้ operation ถัดไปเริ่ม window ใหม่
- หากไม่มี trusted proxy ให้ใช้ account limit ตามปกติและรวม request ใน origin fallback bucket; deployment checklist ต้องเตือนว่า IP protection ยังไม่แยก client

### 6.3 Session validation

- Absolute lifetime 8 ชั่วโมง
- Idle timeout 30 นาที
- อัปเดต `last_seen_at` และ `idle_expires_at` เมื่อ activity ล่าสุดเก่ากว่า 5 นาที เพื่อลด database write โดยยังรักษา idle timeout 30 นาที
- Reject ทันทีหาก cookie signature ผิด, session row ไม่มี, token hash ไม่ตรง, revoked/expired, Staff inactive หรือ claims role/branch ไม่ตรงฐานข้อมูล
- การเปลี่ยน password, role, home branch หรือ status ต้อง revoke session ของ Staff นั้นทั้งหมดใน transaction เดียวกับ mutation
- Session ID ต้อง rotate หลัง Login และ password change เพื่อกัน session fixation

### 6.4 Logout

- ตรวจ Origin และ session ปัจจุบัน
- Revoke session ก่อนลบ cookie
- เขียน `LOGOUT_SUCCESS` เมื่อยังระบุ actor ได้
- หาก session หมดอายุหรือถูก revoke แล้ว ให้ลบ cookie แบบ idempotent และ redirect `/login` โดยไม่แสดง error

### 6.5 Cookie

- ชื่อ cookie ไม่ใช้ชื่อเดิม `fitness_staff_id`
- `HttpOnly`, `SameSite=Lax`, `Path=/`
- `Secure=true` ใน production
- `Max-Age` ไม่เกิน absolute lifetime
- Cookie มีเฉพาะ identifiers/claims ขั้นต่ำและ signature ไม่มีชื่อ เบอร์โทร อีเมล password hash หรือ permission list

## 7. Authorization และ Next.js Proxy

Next.js 16 ใช้ `proxy.ts` แทนชื่อ Middleware เดิม Proxy เป็นเพียง optimistic check และห้ามเป็น security boundary เดียว

- ไม่มี session: page redirect `/login?returnTo=<safe-path>`; API ตอบ 401
- มี session แต่ role ไม่มีสิทธิ์ตาม route map: page redirect ไปหน้า 403 ที่ปลอดภัย; API ให้ DAL/Route Handler ตอบ 403
- Session mode `PASSWORD_CHANGE_REQUIRED`: redirect ทุก protected page ไป `/change-password`
- `/login`, `/change-password`, static assets และ auth endpoints ใช้ matcher/เงื่อนไขที่ไม่เกิด redirect loop
- Login page redirect `/` เมื่อมี FULL session ที่ valid
- ทุก service เดิมเปลี่ยนจาก Staff Switcher context ไปใช้ actor จาก authoritative session และยังเรียก `requirePermission` เหมือนเดิม

เพิ่ม RBAC permissions:

| Permission | Owner | Manager | Counter | Trainer |
|---|---:|---:|---:|---:|
| `auth.security.read` | ทุกสาขาและ unknown events | Staff ในสาขาตน | ไม่ได้ | ไม่ได้ |
| `auth.security.manage` | ทุกสาขา | Staff ที่ไม่ใช่ Owner ในสาขาตน | ไม่ได้ | ไม่ได้ |

## 8. Staff Switcher development mode

- ไม่แสดงและไม่เปิด endpoint โดยปริยาย
- เปิดได้เมื่อ `NODE_ENV=development` และ `ENABLE_DEV_STAFF_SWITCHER=true` พร้อมกันเท่านั้น
- Production ต้องตอบ 404 จาก endpoint แม้มี environment flag
- UI development mode ต้องแสดงคำเตือนชัดเจนว่าเป็นการจำลองตัวตน
- การเปิด switcher ห้ามข้าม Login; ใช้ได้หลัง authenticated session และทุกการสลับต้องสร้าง development audit event

## 9. Admin Security page

เพิ่ม `/settings/security` พร้อม navigation item สำหรับผู้มี `auth.security.read`

### 9.1 Sessions

- Staff, role, branch, Login time, last activity, expiry และสถานะ
- แสดงเฉพาะ user-agent category และ fingerprint ย่อ ห้ามส่ง session token/hash
- Revoke ราย session และ revoke ทั้งหมดของ Staff พร้อม confirmation dialog
- Manager จัดการ Owner หรือ Staff นอกสาขาไม่ได้

### 9.2 Rate limits

- แสดง scope, known Staff หรือ “ไม่ทราบบัญชี”, attempt count, window, lock status และ unlock time
- IP แสดง fingerprint ย่อเท่านั้น
- Owner เห็น unknown/IP buckets ทั้งหมด; Manager เห็นเฉพาะ ACCOUNT bucket ของ Staff ในสาขาตน
- Unlock ต้องใช้ `auth.security.manage`, ตรวจ branch/target role และเขียน audit

### 9.3 Login events

- กรองตาม branch, Staff, action, result และช่วงเวลา
- ใช้ server pagination
- รองรับ `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGIN_RATE_LIMITED`, `LOGOUT_SUCCESS`, `SESSION_EXPIRED`, `SESSION_REVOKED`, `PASSWORD_CHANGED`, `PASSWORD_RESET`, `AUTH_RATE_LIMIT_CLEARED`
- Metadata เก็บเฉพาะ allowlisted reason code, IP fingerprint และ user-agent category
- ใช้ปุ่ม refresh แบบ manual ไม่เพิ่ม polling ในรอบนี้

## 10. UI/UX และ accessibility

### 10.1 `/login`

- ใช้ `staff_code` และ password
- รองรับ light/dark mode, mobile และ keyboard
- มี show/hide password, pending state, focus-visible และ `aria-live` สำหรับ error
- ไม่แสดงข้อมูลที่ใช้ enumerate บัญชี
- Session ที่ valid แล้วเข้า Login ให้ redirect ตาม mode

### 10.2 `/change-password`

- แสดง password policy ก่อน submit
- รับรหัสใหม่และ confirmation
- ไม่ render application Sidebar จนกว่าจะได้ FULL session
- Logout ได้จากหน้านี้เสมอ

### 10.3 Application shell

- แทน Staff Switcher ด้วย current Staff summary และ Logout
- Mobile/desktop ต้องเข้าถึง Logout ได้
- Dev Staff Switcher แสดงเฉพาะตามกฎข้อ 8

### 10.4 Staff และ Security dialogs

- Staff create/reset password และ session revoke/unlock ใช้ accessible dialog
- Destructive security action ต้องแสดง target และผลกระทบก่อนยืนยัน
- ตาราง responsive และคง focus หลัง dialog ปิด

UI ทั้งหมดต้องใช้ design tokens เดิม ไม่ hardcode สี และตรวจด้วย ui-skills, ui-ux-pro-max, dark mode, responsive และ accessibility workflow

## 11. Audit และข้อมูลที่ห้ามเก็บ

Authentication audit ใช้ผลลัพธ์ `SUCCESS`, `FAILED` หรือ `DENIED` ตามเหตุการณ์ `actor_staff_id` และ `branch_id` เป็น null ได้เฉพาะเมื่อยังระบุตัวตนไม่ได้

ห้ามเก็บข้อมูลต่อไปนี้ใน log, audit, response หรือ client state:

- plaintext password หรือ password hash
- session ID, signed cookie หรือ session token hash
- staff code ที่กรอกแล้วไม่พบบัญชี
- IP address ดิบ
- full user-agent string
- request body ของ auth endpoint

Failed audit ต้องไม่ทำให้ auth response เปิดเผย internal error หาก audit write ล้มเหลว ให้ server log เฉพาะ error code ที่ไม่มี credential แล้วปฏิเสธ Login แบบ fail closed เมื่อไม่สามารถบันทึกเหตุการณ์สำคัญได้

## 12. Error handling และ security controls

- Validation error: 400
- Invalid/missing session: page redirect Login, API 401
- Authenticated แต่ไม่มี permission: page 403, API 403
- Rate limited: 429 พร้อม `Retry-After` แบบไม่เปิดเผย account-specific detail
- State conflict: 409
- Server/database error: 500 พร้อมข้อความกลาง
- Auth mutation ตรวจ `Origin` เทียบกับ configured application origin; production ที่ไม่มี configuration ต้อง fail closed
- Return path ต้องเป็น relative path ภายในระบบและห้าม protocol-relative URL
- Login attempt counter และ session/password mutation ใช้ transaction หรือ atomic database operation เพื่อป้องกัน race condition

## 13. Testing strategy

ใช้ Red-Green-Refactor และเพิ่ม test ก่อน implementation ของแต่ละ behavior:

### 13.1 Unit

- Password policy, Argon2id hash/verify adapter และ dummy hash path
- Session claims sign/verify, token hashing, absolute/idle expiry และ status derivation
- Rate-limit window, threshold, lock expiry และ ACCOUNT/IP independence
- Safe return path และ Origin validation
- RBAC permission/branch/Owner boundaries
- Audit metadata allowlist และ prohibited fields

### 13.2 Service และ route

- Login success, invalid code/password, inactive/no-password Staff และ rate limited
- Failed attempt แบบ concurrent ไม่ข้าม threshold
- Logout idempotency, revoke, expired session และ Staff mutation revocation
- Forced password change, Admin reset และ bootstrap rotation
- Proxy redirects สำหรับ missing, invalid-role และ password-change session
- Route Handler ตอบ 401/403/429 ถูกต้องแม้เรียกตรงโดยไม่ผ่าน UI
- Owner/Manager Security visibility และ management boundary

### 13.3 UI

- Login, Change Password, Logout และ error/pending states
- Staff create/reset password dialogs
- Security sessions/rate-limits/events, filters, pagination, revoke และ unlock
- Keyboard, focus management, accessible names, light/dark และ responsive

### 13.4 Migration และ final verification

- Migration สร้าง column/table/index/foreign key ใหม่โดยข้อมูลเดิมไม่สูญหาย
- Bootstrap `OWNER001` สำเร็จโดยไม่แสดง plaintext/hash
- `npm test`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `npx drizzle-kit migrate`
- Browser QA ที่ `http://localhost:3005` ครบ Login, forced password change, Logout, role denial, rate limit, Admin Security, light/dark และ mobile/desktop

## 14. Success criteria

- ไม่มีผู้ใช้ที่ไม่มี valid session เข้าหน้า protected หรือเรียก protected API ได้
- Role/branch ที่ไม่มีสิทธิ์ถูกปฏิเสธทั้ง Proxy, UI และ server guard
- Password ทั้งหมดเก็บเป็น Argon2id hash และไม่ปรากฏใน Git, log, audit หรือ response
- Session cookie ใช้ flags ที่กำหนดและ revoke/expiry/inactive Staff มีผลทันทีที่ authoritative check
- ผิด 5 ครั้งต่อบัญชีหรือ 20 ครั้งต่อ IP ภายใน 15 นาทีแล้วถูกล็อก 15 นาทีโดย counter ทนต่อ concurrent request
- Login, Logout, failure, rate limit, expiry, password change/reset, revoke และ unlock ตรวจสอบย้อนหลังได้โดยไม่มี credential/PII ต้องห้าม
- Owner และ Manager เห็น/จัดการ Security state ตามขอบเขตที่กำหนด
- Staff ใหม่และ Staff ที่ Admin reset ต้องเปลี่ยนรหัสผ่านก่อนใช้ application
- Staff Switcher ใช้ไม่ได้ใน production และ development ต้อง opt in ชัดเจน
- ระบบทำงานบน port 3005 และผ่าน automated verification กับ browser QA

## 15. งานที่ไม่รวมในรอบนี้

- Self-registration และ member login
- Forgot-password ผ่านอีเมล/SMS
- MFA, passkey, SSO และ social login
- Trusted device หรือ remember-me เกิน 8 ชั่วโมง
- Cron สำหรับ session/rate-limit cleanup
- Security alert ผ่านอีเมล/Slack
- แสดง IP address ดิบหรือ geolocation
