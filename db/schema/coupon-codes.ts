import {
  boolean,
  decimal,
  index,
  int,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { members } from "./members";
import { payments } from "./payments";
import { promotions } from "./promotions";

export const couponCodes = mysqlTable(
  "coupon_codes",
  {
    id: int("id").autoincrement().primaryKey(),
    promotionId: int("promotion_id")
      .notNull()
      .references(() => promotions.id),
    code: varchar("code", { length: 32 }).notNull(),
    maxUses: int("max_uses"),
    usedCount: int("used_count").notNull().default(0),
    perMemberLimit: int("per_member_limit").notNull().default(1),
    minPurchase: decimal("min_purchase", { precision: 10, scale: 2 })
      .notNull()
      .default("0.00"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("coupon_codes_code_unique").on(table.code),
    index("coupon_codes_promotion_idx").on(table.promotionId),
  ],
);

export const couponRedemptions = mysqlTable(
  "coupon_redemptions",
  {
    id: int("id").autoincrement().primaryKey(),
    couponId: int("coupon_id")
      .notNull()
      .references(() => couponCodes.id),
    memberId: int("member_id")
      .notNull()
      .references(() => members.id),
    paymentId: int("payment_id")
      .notNull()
      .references(() => payments.id),
    discountAmount: decimal("discount_amount", { precision: 10, scale: 2 })
      .notNull()
      .default("0.00"),
    redeemedAt: timestamp("redeemed_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("coupon_redemptions_payment_unique").on(table.paymentId),
    index("coupon_redemptions_member_coupon_idx").on(table.memberId, table.couponId),
  ],
);

export type CouponCode = typeof couponCodes.$inferSelect;
export type NewCouponCode = typeof couponCodes.$inferInsert;
export type CouponRedemption = typeof couponRedemptions.$inferSelect;
export type NewCouponRedemption = typeof couponRedemptions.$inferInsert;
