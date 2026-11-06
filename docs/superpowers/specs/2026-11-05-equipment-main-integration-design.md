# Equipment Main Integration Design

## Intent

นำระบบอุปกรณ์เวอร์ชัน production-ready จาก `codex/equipment-production-ready` มารวมกับ `main` ปัจจุบันโดยไม่ทำให้ Auth, Member Portal, TOTP, database readiness หรือประวัติ migration ที่ใช้งานจริงถอยหลัง เพื่อให้ผู้ใช้เริ่มทดสอบ flow อุปกรณ์บนพอร์ต 3005 ได้

## Goals

- รักษาฟังก์ชัน equipment retirement, optimistic concurrency, RBAC, transaction/audit hardening, pagination และ responsive management UI ที่ผ่าน review แล้ว
- รักษาการเปลี่ยนแปลงล่าสุดทั้งหมดบน `main` โดยเฉพาะ public route policy, Login readiness และ migrations `0011–0016`
- สร้าง migration ใหม่ต่อจากฐานจริงเป็น `0017_equipment_production_ready`
- สำรองข้อมูลแบบเข้ารหัสและตรวจ dry-run ก่อน apply migration
- ส่งมอบ `main` ที่ tests, typecheck, lint, build, Drizzle check และ HTTP smoke test ผ่าน

## Non-goals

- ไม่เพิ่ม feature อุปกรณ์นอกขอบเขต branch เดิม เช่น restore อุปกรณ์ที่ retire แล้วหรือย้ายอุปกรณ์ข้ามสาขา
- ไม่เดา credential/provider protocol หรือยืนยันฮาร์ดแวร์จริงในรอบนี้
- ไม่รวมผลิตภัณฑ์ใหม่ เช่น statutory payroll, native mobile app หรือ SSO เข้ากับ integration นี้

## Approaches

1. **Merge `main` เข้า branch เดิมและ regenerate migration — เลือกแนวทางนี้** เพราะรักษา 22 commits และ review history ไว้ครบ ขณะที่ไฟล์ชนจริงมีเพียง route policy, bootstrap test และ migration metadata
2. Cherry-pick commits ทีละชุดบน branch ใหม่ — ลด merge commit แต่เสี่ยงตกหล่น dependency ระหว่าง 22 commits และต้อง review ซ้ำมากกว่า
3. Squash/port diff ทั้งก้อน — ประวัติอ่านง่ายแต่ทำลาย traceability ของ RED/GREEN และ review fixes

## Integration Rules

- `lib/auth/route-policy.ts` และ test ต้องเก็บ public paths/TOTP/health ล่าสุดจาก `main` แล้วเปลี่ยนเฉพาะ `/equipment` เป็น `equipment.read`
- `scripts/bootstrap-owner.test.ts` ใช้พฤติกรรมล่าสุดจาก `main`
- `drizzle/meta/0011_snapshot.json` และ `_journal.json` ใช้ lineage จาก `main`; ลบ SQL `0011` ของ equipment ก่อน generate ใหม่
- Generated `0017` ต้องมีเพียง enum `RETIRED`, columns `retired_at`, `retired_reason`, `version` และ composite indexes 3 ตัว ห้ามมี destructive statement หรือ schema อื่น
- Equipment code ต้อง unique ทั้งบริษัท; Owner/Manager จัดการได้ ส่วน Counter/Trainer อ่านอย่างเดียวและทุก mutation ต้องตรวจ branch/session/RBAC ฝั่ง server
- ฟังก์ชันและกฎธุรกิจที่เพิ่มหรือแก้ต้องมีคอมเมนต์ภาษาไทยเมื่อเหตุผลไม่ชัดจากโค้ด

## Database Safety

- Preflight ต้องยืนยัน journal ล่าสุดเป็น `0016_add_staff_workforce`, equipment columns/indexes ใหม่ยังไม่มี และข้อมูลเดิมไม่ผิด invariant
- สร้าง encrypted backup จาก schema `0016_add_staff_workforce` และ dry-run restore ให้ผ่านก่อน DDL
- MySQL DDL auto-commit: หาก migration ล้มกลางทาง ห้าม retry แบบตาบอด ให้ตรวจ `information_schema` แล้วซ่อม forward เฉพาะส่วนที่ขาด
- Postflight ต้องยืนยัน journal `0017`, row counts ไม่เปลี่ยน, existing rows มี `version = 1`, enum/columns/indexes ตรง schema และ `/api/health` พร้อม

## Delivery

เมื่อ automated verification และฐานข้อมูลผ่าน ให้ merge กลับ `main`, push `origin/main`, เปิด dev server พอร์ต 3005 ไว้ให้ผู้ใช้ทดสอบ และเก็บข้อจำกัด browser role/hardware ที่ยังต้องใช้ข้อมูลหรืออุปกรณ์จริงไว้ในรายงาน
