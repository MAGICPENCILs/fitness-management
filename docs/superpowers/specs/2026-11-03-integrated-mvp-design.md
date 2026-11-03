# Fitness Pro Integrated MVP Design

**วันที่:** 2026-11-03

## Intent

ทำ Fitness Pro ให้เป็นระบบที่ผู้ใช้สามารถทดสอบงานจริงแบบ end-to-end บนพอร์ต `3005` ได้ โดยปิดงานความปลอดภัยเดิมก่อน แล้วเติมงานปฏิบัติการที่ยังขาดโดยไม่สร้าง credentials แทนผู้ใช้และไม่สั่งงานอุปกรณ์หรือ restore ฐานข้อมูลจริงแบบเงียบ ๆ

## Goals

- ปิดงาน Login/Session/Logout, RBAC และ Security Console พร้อม browser QA ตามบทบาท
- อัปเกรดจาก Next.js `16.2.11` ไปยังรุ่น stable ล่าสุดในสาย `16.3.x` และอ่านคู่มือจาก `node_modules/next/dist/docs/` ก่อนแก้ API
- มี Backup/Verify/Restore สำหรับ Operator ที่ไม่เผย secret และต้องยืนยันฐานข้อมูลเป้าหมายก่อน restore
- มีใบเสร็จ/ใบกำกับภาษีแบบพิมพ์ได้ พร้อมข้อมูล VAT ที่กำหนดจาก settings
- ส่ง Notification ผ่าน adapter ที่เปิดด้วย environment เท่านั้น; หากไม่มี credentials ต้องคงสถานะ QUEUED/SKIPPED อย่างซื่อสัตย์
- รองรับ Freeze/Unfreeze, Dynamic QR แบบหมุน token และจุดสแกนแบบ simulator/config-gated hardware adapter
- มี Member Portal responsive/PWA-ready และ Online Signup แบบ pending approval ใน repo เดียว
- มี TOTP 2FA สำหรับ Staff ที่เลือกเปิดใช้, เวลาเข้าออกงาน, เงินเดือนฐาน และ commission ledger แบบไม่คำนวณภาษีเงินเดือน
- เพิ่มรายงาน peak hour, สมาชิก, โปรโมชั่น, VAT และ export CSV/print-friendly
- อัปเดต README, roadmap และหน้าตั้งค่าให้ตรงกับระบบจริง

## Non-goals

- ไม่สร้างแอป React Native แยกในรอบนี้; Member Portal responsive คือช่องทางมือถือของ MVP
- ไม่คำนวณภาษีเงินเดือน ประกันสังคม หรือโอนเงินจริง
- ไม่ส่ง SMS/LINE/Email หากไม่มี credentials จริง
- ไม่เปิดประตูหรืออ่านบัตรประชาชนจริงหากไม่มี adapter/device ที่ผู้ใช้กำหนด
- ไม่ restore ฐานข้อมูล production ระหว่างการทดสอบอัตโนมัติ

## Safety Constraints

- ทุก mutation ใช้ authoritative session, RBAC, branch scope, Zod และ audit ตาม pattern เดิม
- Backup เก็บนอก Git, manifest มี SHA-256, restore ต้องระบุฐานข้อมูลและ confirmation token ตรงกัน
- Dynamic QR เก็บเฉพาะ hash ของ token, มี expiry สั้น และ revoke/rotate ได้
- Member Portal ใช้ session แยกจาก Staff และห้ามเข้าถึง Staff API
- 2FA secret ต้องเข้ารหัสก่อนเก็บและ recovery codes เก็บเป็น hash
- Provider/Hardware adapter ปิดเป็นค่าเริ่มต้นและมี simulator สำหรับ QA
- คอมเมนต์ฟังก์ชันและกฎธุรกิจที่เพิ่มหรือแก้ใช้ภาษาไทย

## Approaches Considered

1. **ต่อยอดใน Next.js monolith เดิม (เลือก):** ใช้ schema/service/route/component pattern เดิม ลด dependency และทำ transaction/audit ซ้ำแบบเดียวกัน ข้อเสียคือแผนใหญ่ ต้องส่งเป็นหลายชุดย่อย
2. **แยก microservices และ mobile app:** แยกขอบเขตชัด แต่เพิ่ม deployment, auth และ data consistency มากเกินความจำเป็นของ MVP
3. **เชื่อม Provider/Hardware จริงทันที:** ทดสอบหน้างานได้เร็วเมื่อมีอุปกรณ์ แต่ทำงานไม่ได้โดยไม่มี credentials/device และเสี่ยง side effect จึงใช้ adapter + simulator ก่อน

## Delivery Slices

### A. Foundation and Release Hygiene

ปิด dirty Auth changes, เพิ่ม output ignore, ทดสอบ Login/Security, อัปเกรด Next.js 16.3.x, อัปเดตเอกสาร และ push baseline ที่สะอาด

### B. Operational Safety and Documents

เพิ่ม operator backup CLI, printable receipt/tax invoice, notification adapters และ hardware simulator/adapter contract

### C. Membership Lifecycle and Portal

เพิ่ม freeze ledger, dynamic QR, scan validation, pending online applications และ Member Portal session/UI

### D. Workforce and Strong Authentication

เพิ่ม Staff TOTP, attendance punches, compensation profile, commission ledger และสรุปรอบเงินเดือนแบบ manual approval

### E. Reporting and System QA

เพิ่มรายงาน/exports, ปรับ settings/README/roadmap, browser QA light/dark/mobile/keyboard/roles และ full verification

## Success Criteria

- ทุก slice มี RED/GREEN tests, migration, audit coverage และ commit ของตัวเอง
- `vitest`, `tsc`, `eslint`, `next build` ผ่านบน final HEAD
- Browser QA ใช้ port `3005` ครอบคลุม Staff roles และ Member Portal โดยไม่พิมพ์ secret
- main สะอาดและ push ขึ้น `origin/main`; ข้อจำกัดของ Provider/Hardware จริงถูกบันทึกตรงไปตรงมา

