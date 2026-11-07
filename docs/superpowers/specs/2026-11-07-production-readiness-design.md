# Production Readiness Design

วันที่: 2026-11-07
สถานะ: อนุมัติให้ดำเนินการจากคำสั่งเดิมที่ให้ปิดงานทั้งหมดโดยไม่ถามซ้ำ

## เป้าหมาย

เพิ่ม release gate ที่ตรวจซ้ำได้บน GitHub และบันทึกขั้นตอน deploy แบบ self-hosted ให้ผู้ดูแลทำตามได้ โดยไม่ผูก repository กับผู้ให้บริการ, process manager หรือ reverse proxy รายใดก่อนทราบ infrastructure จริง

## ขอบเขต

- GitHub Actions รันบน push เข้า `main` และ pull request
- ใช้ Node.js 20, `npm ci` และคำสั่งตรวจที่ repository ใช้อยู่แล้ว
- ตรวจ test แบบ serial, TypeScript, ESLint, Drizzle schema และ production build
- เอกสาร deploy สำหรับ Next.js Node.js server แบบ single instance หลัง trusted reverse proxy
- ระบุ backup/migration, secret, health probe, graceful shutdown, rollback และข้อจำกัด multi-instance

## ไม่อยู่ในขอบเขต

- ไม่ deploy จริงและไม่เพิ่ม credential
- ไม่สร้าง Docker image, PM2 ecosystem หรือ nginx config เพราะยังไม่ทราบ target infrastructure
- ไม่เปลี่ยน schema, runtime behavior หรือ business data
- ไม่อ้างว่า external provider, hardware, offsite restore หรือ multi-instance ผ่าน acceptance แล้ว

## แนวทางที่พิจารณา

1. **เพิ่ม CI อย่างเดียว** — diff เล็กที่สุด แต่ผู้ดูแลยังไม่มีขั้นตอน deploy/rollback ที่เชื่อมกับ backup และ health gate
2. **CI + runbook แบบ vendor-neutral (เลือก)** — ปิดช่องว่าง release/deploy โดยใช้ของเดิมทั้งหมดและไม่เดา infrastructure
3. **Docker + reverse proxy + process manager ครบชุด** — deploy ได้เป็นรูปธรรมกว่า แต่เพิ่ม platform choice, maintenance และ security surface ที่ผู้ใช้ยังไม่ได้กำหนด

## การออกแบบ

Workflow ใช้ official checkout/setup-node actions, จำกัดสิทธิ์ `contents: read`, ยกเลิก run เก่าของ ref เดียวกัน และกำหนด timeout เพื่อไม่ให้ job ค้าง แต่ละคำสั่งรันแยกเพื่อเห็น gate ที่ล้มชัดเจน ไม่มี service database และไม่มี production secret เพราะ automated suite/build ต้องไม่แตะฐานจริง

Runbook ยึด Next.js 16.4.4 ที่ติดตั้งอยู่: `npm ci` → release gates → encrypted backup/dry-run → migration → `npm run build` → `npm run start` บนพอร์ต 3005 หลัง reverse proxy/TLS. `/api/health` เป็น readiness probe และ rollback ต้องใช้ artifact/source revision เดิมโดยไม่ rollback schema แบบเดาสุ่ม

## เกณฑ์สำเร็จ

- Workflow YAML มี trigger, least privilege, concurrency, timeout และ release commands ครบ
- คำสั่ง release gate ทั้งหมดผ่านใน checkout ที่สะอาด
- Runbook ไม่เผย secret และแยก pre-deploy/deploy/verify/rollback ชัดเจน
- `git diff --check` ผ่าน และ independent review ไม่พบ Critical/Important
