import { describe, expect, it } from "vitest";

import {
  buildReceiptSnapshot,
  calculateInclusiveVat,
  createReceiptNumber,
  ReceiptError,
} from "@/lib/receipt-service";

describe("receipt financial snapshot", () => {
  it("สร้างเลขเอกสารไม่เกิน 20 ตัวและไม่ชนกันข้ามสาขาหรือ payment", () => {
    const issuedAt = new Date("2026-11-03T03:00:00.000Z");

    expect(createReceiptNumber(issuedAt, 1, 42)).toBe("R2026110300100000042");
    expect(createReceiptNumber(issuedAt, 2, 42)).not.toBe(
      createReceiptNumber(issuedAt, 1, 42),
    );
    expect(createReceiptNumber(issuedAt, 1, 43)).not.toBe(
      createReceiptNumber(issuedAt, 1, 42),
    );
  });

  it("แยก VAT 7% จากราคารวมโดยปัดเป็นสตางค์", () => {
    expect(calculateInclusiveVat("1070.00", "7.00")).toEqual({
      subtotalExVat: "1000.00",
      vatAmount: "70.00",
      totalAmount: "1070.00",
      vatRate: "7.00",
    });
    expect(calculateInclusiveVat("1000.00", "7.00")).toEqual({
      subtotalExVat: "934.58",
      vatAmount: "65.42",
      totalAmount: "1000.00",
      vatRate: "7.00",
    });
  });

  it("สร้างใบเสร็จธรรมดาโดยไม่คิด VAT เมื่อสาขาไม่ได้จดทะเบียน", () => {
    const snapshot = buildReceiptSnapshot({
      receiptNumber: "REC202611030001",
      issuedAt: new Date("2026-11-03T03:00:00.000Z"),
      totalAmount: "599.00",
      paymentMethod: "CASH",
      memberName: "สมาชิก ทดสอบ",
      packageName: "รายเดือน",
      branch: {
        name: "Fitness Pro สาขาหลัก",
        address: "กรุงเทพฯ",
        phone: "021234567",
      },
    });

    expect(snapshot).toMatchObject({
      documentType: "RECEIPT",
      sellerName: "Fitness Pro สาขาหลัก",
      buyerName: "สมาชิก ทดสอบ",
      itemDescription: "แพ็กเกจสมาชิก: รายเดือน",
      subtotalExVat: "599.00",
      vatRate: "0.00",
      vatAmount: "0.00",
      totalAmount: "599.00",
    });
  });

  it("เก็บข้อมูลผู้ขายและผู้ซื้อเป็น snapshot สำหรับใบกำกับภาษี", () => {
    const branch = {
      name: "ชื่อสาขาที่เปลี่ยนได้",
      address: "ที่อยู่สาขา",
      phone: "020000000",
    };
    const snapshot = buildReceiptSnapshot({
      receiptNumber: "REC202611030002",
      issuedAt: new Date("2026-11-03T03:00:00.000Z"),
      totalAmount: "1070.00",
      paymentMethod: "TRANSFER",
      memberName: "ผู้ซื้อ เดิม",
      packageName: "รายปี",
      branch,
      settings: {
        legalName: "บริษัท ฟิตเนส โปร จำกัด",
        taxId: "0105559999999",
        branchNumber: "00000",
        address: "99 ถนนตัวอย่าง กรุงเทพฯ",
        phone: "021234567",
        vatRegistered: true,
        vatRate: "7.00",
      },
      taxInvoice: {
        buyerName: "บริษัท ลูกค้า จำกัด",
        buyerTaxId: "0105558888888",
        buyerAddress: "88 ถนนลูกค้า กรุงเทพฯ",
      },
    });
    branch.name = "ชื่อใหม่หลังออกเอกสาร";

    expect(snapshot).toMatchObject({
      documentType: "TAX_INVOICE",
      sellerName: "บริษัท ฟิตเนส โปร จำกัด",
      sellerTaxId: "0105559999999",
      sellerBranchNumber: "00000",
      buyerName: "บริษัท ลูกค้า จำกัด",
      buyerTaxId: "0105558888888",
      subtotalExVat: "1000.00",
      vatAmount: "70.00",
      totalAmount: "1070.00",
    });
    expect(snapshot.sellerName).not.toBe(branch.name);
  });

  it("ปฏิเสธใบกำกับภาษีเมื่อข้อมูลผู้ขายหรือผู้ซื้อไม่ครบ", () => {
    expect(() =>
      buildReceiptSnapshot({
        receiptNumber: "REC202611030003",
        issuedAt: new Date(),
        totalAmount: "1000.00",
        paymentMethod: "CASH",
        memberName: "สมาชิก ทดสอบ",
        packageName: "รายเดือน",
        branch: { name: "Fitness Pro" },
        taxInvoice: {
          buyerName: "บริษัท ลูกค้า จำกัด",
          buyerTaxId: "0105558888888",
          buyerAddress: "กรุงเทพฯ",
        },
      }),
    ).toThrowError(new ReceiptError("TAX_SELLER_SETTINGS_REQUIRED"));
  });
});
