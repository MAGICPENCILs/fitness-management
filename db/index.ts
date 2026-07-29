import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

const connection = await mysql.createConnection({
  uri: process.env.DATABASE_URL!,
  charset: "utf8mb4",
});

await connection.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");

export const db = drizzle(connection);
