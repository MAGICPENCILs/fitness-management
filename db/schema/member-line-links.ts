import { char, int, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";
import { branches } from "./branches";
import { members } from "./members";
import { staff } from "./staff";

// แยก identifier จาก members เพื่อไม่ให้ whole-row DTO เผย LINE ID หรือ challenge hash
export const memberLineLinks = mysqlTable("member_line_links", {
  memberId: int("member_id").primaryKey().references(() => members.id),
  lineUserId: varchar("line_user_id", { length: 33 }).unique(),
  challengeHash: char("challenge_hash", { length: 64 }).unique(),
  challengeExpiresAt: timestamp("challenge_expires_at"),
  initiatedByStaffId: int("initiated_by_staff_id").references(() => staff.id),
  branchId: int("branch_id").notNull().references(() => branches.id),
  linkedAt: timestamp("linked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});
