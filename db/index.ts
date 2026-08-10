import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

// Pool แยก connection ต่อ transaction เพื่อไม่ให้คำสั่ง BEGIN/COMMIT ของ request พร้อมกันทับ transaction เดียวกัน
const pool = mysql.createPool({
  uri: process.env.DATABASE_URL!,
  charset: "utf8mb4_unicode_ci",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export const db = drizzle(pool);
