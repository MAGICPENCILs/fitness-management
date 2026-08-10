# Next.js 16.2.11 Upgrade Design

**วันที่:** 2026-08-10  
**สถานะ:** อนุมัติแล้วเมื่อ 2026-08-10

## เป้าหมาย

อัปเกรดโปรเจกต์จาก Next.js 16.2.6 เป็น Next.js 16.2.11 ซึ่งเป็นรุ่น Stable/Active LTS ที่มี security fixes ล่าสุด โดยทำบน `main` ก่อนรวม branch `codex/pdpa-rbac`

## ขอบเขต

- เปลี่ยน `next` จาก `16.2.6` เป็น `16.2.11`
- เปลี่ยน `eslint-config-next` จาก `16.2.6` เป็น `16.2.11` ให้ตรงกับ framework
- อัปเดต `package-lock.json` ผ่าน npm
- คง React, React DOM และ dependency อื่นไว้ที่รุ่นเดิม เว้นแต่ npm ต้องปรับ transitive dependency ของ Next.js โดยตรง
- ไม่เปิดใช้ฟีเจอร์ทดลอง ไม่รัน codemod และไม่แก้โค้ดแอปหาก verification ผ่านอยู่แล้ว
- ไม่รวม branch PDPA/RBAC และไม่ push ภายในงานอัปเกรดนี้

## วิธีดำเนินการ

ใช้การติดตั้งแบบระบุเลขรุ่นแน่นอนแทน `@latest` หรือ codemod เพื่อให้ diff เล็ก ตรวจสอบง่าย และไม่ดึง Next.js 16.3 Preview/Canary เข้ามาโดยไม่ตั้งใจ หลังติดตั้งให้อ่านเอกสารที่ตรงกับรุ่นจาก `node_modules/next/dist/docs/` ก่อนแก้โค้ดใด ๆ ที่อาจจำเป็นจากผล verification

## การตรวจสอบ

1. ตรวจว่า `package.json`, lockfile และ `node_modules/next/package.json` รายงานรุ่น 16.2.11
2. รัน TypeScript typecheck
3. รัน ESLint โดยต้องไม่มี error ใหม่
4. รัน production build ให้สำเร็จ
5. เปิด development server บน port 3005 และตรวจหน้าแอปหลักพร้อม browser console
6. ตรวจ `git diff --check` และยืนยันว่าเปลี่ยนเฉพาะไฟล์ที่เกี่ยวข้องกับการอัปเกรดหรือการแก้ regression ที่พิสูจน์ได้

## การจัดการความล้มเหลว

หากติดตั้งหรือ verification ล้มเหลว จะหาสาเหตุตามข้อความผิดพลาดก่อน หากเป็น regression ของแอปจะเพิ่ม regression test ที่ล้มเหลวก่อนแก้โค้ด หากเป็น incompatibility ที่ไม่สามารถแก้แบบเจาะจงได้ จะหยุดและรายงานโดยไม่ลดรุ่นหรือขยายขอบเขตเอง

## เกณฑ์สำเร็จ

- Next.js และ eslint-config-next เป็น 16.2.11
- typecheck, lint และ build ผ่าน
- แอปรันบน port 3005 และหน้าใช้งานหลักโหลดได้โดยไม่มี application error
- working tree สะอาดหลัง commit แยกสำหรับการอัปเกรด
