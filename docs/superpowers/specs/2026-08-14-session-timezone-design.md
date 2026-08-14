# Session Timezone Consistency Design

## ปัญหา

การ Login สร้าง Session และ `LOGIN_SUCCESS` สำเร็จ แต่การเปิดหน้าที่ป้องกันสิทธิ์อาจถูกส่งกลับหน้า Login หลายรอบ ข้อมูลจาก dev log และฐานข้อมูลยืนยันว่า MySQL ใช้ UTC ขณะที่ process ของแอปใช้ `Asia/Bangkok` และ MySQL pool ยังไม่ได้กำหนด timezone อย่างชัดเจน การแปลงคอลัมน์ `TIMESTAMP` จึงขึ้นกับ timezone ของแต่ละ runtime และอาจทำให้ claims, idle expiry และ absolute expiry ไม่ตรงกับค่าที่อ่านกลับจากฐานข้อมูล

## แนวทางที่เลือก

กำหนด `timezone: "Z"` ที่ MySQL pool ใน `db/index.ts` เพื่อให้การเขียนและอ่าน `Date` ใช้ UTC อย่างสม่ำเสมอ โดยไม่แก้ schema และไม่ย้ายข้อมูลเดิม MySQL เก็บ `TIMESTAMP` เป็น UTC อยู่แล้ว จึงเป็นการระบุ contract ของ connection ให้ตรงกับข้อมูลที่มี

## ขอบเขต

- เพิ่ม regression test ที่ยืนยันว่า production pool ถูกสร้างด้วย timezone UTC
- เพิ่ม `timezone: "Z"` ใน configuration ของ pool
- ปรับคอมเมนต์ภาษาไทยของ pool ให้อธิบายเหตุผลและผลกระทบของ timezone
- รีสตาร์ต dev server บน port 3005 เพื่อให้ pool ใหม่มีผล
- ตรวจ typecheck, focused test และ Login flow หนึ่งรอบ

ไม่รวมการเปลี่ยนชนิดคอลัมน์เวลา การแก้ migration หรือการเปลี่ยนเวลาแสดงผลใน UI

## การไหลของข้อมูลหลังแก้

1. Login สร้างเวลา Session จาก `Date` และส่งเข้า MySQL ผ่าน connection ที่กำหนด UTC
2. MySQL เก็บ `TIMESTAMP` ใน UTC
3. Session loader อ่านค่าผ่าน connection UTC และได้ `Date` ที่แทน instant เดิม
4. การเทียบ signed claims, idle expiry และ absolute expiry จึงไม่ขึ้นกับ timezone ของเครื่องหรือ worker

## การจัดการข้อผิดพลาด

พฤติกรรม fail-closed เดิมยังคงอยู่ หาก cookie, claims หรือแถว Session ไม่ถูกต้อง ระบบยังส่งผู้ใช้กลับหน้า Login การแก้ครั้งนี้ไม่ลดระดับการตรวจสอบ Session

## เกณฑ์สำเร็จ

- Regression test ล้มเหลวก่อนแก้และผ่านหลังเพิ่ม UTC pool configuration
- TypeScript และ focused auth/session tests ผ่าน
- Dev server กลับมา Ready ที่ `http://localhost:3005`
- การ Login ด้วยบัญชีที่ถูกต้องเข้าสู่ Dashboard ได้ในการส่งข้อมูลครั้งแรก โดยไม่มีวงจร `POST 200 -> GET / 307`
