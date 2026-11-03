import {
  boolean,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

import { branches } from "./branches";
import { payments } from "./payments";
import { staff } from "./staff";

export const branchReceiptSettings = mysqlTable("branch_receipt_settings", {
  branchId: int("branch_id")
    .primaryKey()
    .references(() => branches.id),
  legalName: varchar("legal_name", { length: 200 }).notNull(),
  taxId: varchar("tax_id", { length: 13 }),
  branchNumber: varchar("branch_number", { length: 5 })
    .notNull()
    .default("00000"),
  address: text("address").notNull(),
  phone: varchar("phone", { length: 20 }),
  vatRegistered: boolean("vat_registered").notNull().default(false),
  vatRate: decimal("vat_rate", { precision: 5, scale: 2 })
    .notNull()
    .default("7.00"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const receipts = mysqlTable("receipts", {
  id: int("id").autoincrement().primaryKey(),
  paymentId: int("payment_id")
    .notNull()
    .unique()
    .references(() => payments.id),
  branchId: int("branch_id")
    .notNull()
    .references(() => branches.id),
  issuedByStaffId: int("issued_by_staff_id")
    .notNull()
    .references(() => staff.id),
  receiptNumber: varchar("receipt_number", { length: 30 }).notNull().unique(),
  documentType: mysqlEnum("document_type", ["RECEIPT", "TAX_INVOICE"])
    .notNull(),
  issuedAt: timestamp("issued_at").notNull(),
  sellerName: varchar("seller_name", { length: 200 }).notNull(),
  sellerTaxId: varchar("seller_tax_id", { length: 13 }),
  sellerBranchNumber: varchar("seller_branch_number", { length: 5 }),
  sellerAddress: text("seller_address"),
  sellerPhone: varchar("seller_phone", { length: 20 }),
  buyerName: varchar("buyer_name", { length: 200 }).notNull(),
  buyerTaxId: varchar("buyer_tax_id", { length: 13 }),
  buyerAddress: text("buyer_address"),
  itemDescription: text("item_description").notNull(),
  quantity: int("quantity").notNull().default(1),
  subtotalExVat: decimal("subtotal_ex_vat", {
    precision: 10,
    scale: 2,
  }).notNull(),
  vatRate: decimal("vat_rate", { precision: 5, scale: 2 }).notNull(),
  vatAmount: decimal("vat_amount", { precision: 10, scale: 2 }).notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: mysqlEnum("payment_method", [
    "CASH",
    "QR_PROMPTPAY",
    "TRANSFER",
    "CREDIT_CARD",
  ]).notNull(),
});

export type Receipt = typeof receipts.$inferSelect;
export type NewReceipt = typeof receipts.$inferInsert;
export type BranchReceiptSetting = typeof branchReceiptSettings.$inferSelect;
