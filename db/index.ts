import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

// Pool แยก connection ต่อ transaction และบังคับ UTC เพื่อให้ TIMESTAMP ของ Session ไม่เปลี่ยนความหมายตาม timezone ของ worker
const pool = mysql.createPool({
  uri: process.env.DATABASE_URL!,
  charset: "utf8mb4_unicode_ci",
  timezone: "Z",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export const db = drizzle(pool);

/** ปิด pool หลังคำสั่ง CLI ทำงานเสร็จ เพื่อไม่ให้ process ค้างและไม่ตัด transaction กลางทาง */
export async function closeDatabase() {
  await pool.end();
}
