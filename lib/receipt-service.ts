import { z } from "zod";

const moneySchema = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/);
const taxIdSchema = z.string().regex(/^\d{13}$/);
const branchNumberSchema = z.string().regex(/^\d{5}$/);

export const receiptSettingsInputSchema = z
  .object({
    legalName: z.string().trim().min(2).max(200),
    taxId: z.string().trim().max(13).optional(),
    branchNumber: branchNumberSchema,
    address: z.string().trim().min(5).max(1_000),
    phone: z.string().trim().max(20).optional(),
    vatRegistered: z.boolean(),
    vatRate: z.string().regex(/^\d{1,2}(?:\.\d{1,2})?$/),
  })
  .superRefine((value, context) => {
    // ผู้ประกอบการ VAT ต้องมีเลขผู้เสียภาษีครบก่อนออกใบกำกับภาษีได้
    if (value.vatRegistered && !taxIdSchema.safeParse(value.taxId).success) {
      context.addIssue({
        code: "custom",
        path: ["taxId"],
        message: "กรุณาระบุเลขผู้เสียภาษี 13 หลัก",
      });
    }
  });

export const taxInvoiceInputSchema = z.object({
  buyerName: z.string().trim().min(2).max(200),
  buyerTaxId: taxIdSchema,
  buyerAddress: z.string().trim().min(5).max(1_000),
});

const receiptBuildSchema = z.object({
  receiptNumber: z.string().trim().min(1).max(30),
  issuedAt: z.date(),
  totalAmount: moneySchema,
  paymentMethod: z.enum([
    "CASH",
    "QR_PROMPTPAY",
    "TRANSFER",
    "CREDIT_CARD",
  ]),
  memberName: z.string().trim().min(1).max(201),
  packageName: z.string().trim().min(1).max(100),
  branch: z.object({
    name: z.string().trim().min(1).max(150),
    address: z.string().trim().max(1_000).nullish(),
    phone: z.string().trim().max(20).nullish(),
  }),
  settings: receiptSettingsInputSchema.nullish(),
  taxInvoice: taxInvoiceInputSchema.optional(),
});

export type ReceiptSnapshot = {
  receiptNumber: string;
  documentType: "RECEIPT" | "TAX_INVOICE";
  issuedAt: Date;
  sellerName: string;
  sellerTaxId: string | null;
  sellerBranchNumber: string | null;
  sellerAddress: string | null;
  sellerPhone: string | null;
  buyerName: string;
  buyerTaxId: string | null;
  buyerAddress: string | null;
  itemDescription: string;
  quantity: number;
  subtotalExVat: string;
  vatRate: string;
  vatAmount: string;
  totalAmount: string;
  paymentMethod: "CASH" | "QR_PROMPTPAY" | "TRANSFER" | "CREDIT_CARD";
};

export class ReceiptError extends Error {
  /** เก็บรหัสธุรกิจแบบคงที่เพื่อให้ route แปลงเป็นข้อความไทยโดยไม่เผยรายละเอียดข้อมูลการเงิน */
  constructor(public code: string) {
    super(code);
    this.name = "ReceiptError";
  }
}

/** สร้างเลขเอกสารจากวันที่ UTC, สาขา และ payment id ที่ฐานข้อมูลออกให้ จึงไม่ชนกันจากคำขอพร้อมกันและยังอยู่ในคอลัมน์ 20 ตัว */
export function createReceiptNumber(
  issuedAt: Date,
  branchId: number,
  paymentId: number,
): string {
  if (
    Number.isNaN(issuedAt.getTime()) ||
    !Number.isInteger(branchId) ||
    branchId < 1 ||
    branchId > 999 ||
    !Number.isInteger(paymentId) ||
    paymentId < 1 ||
    paymentId > 99_999_999
  ) {
    throw new ReceiptError("RECEIPT_NUMBER_INPUT_INVALID");
  }
  const date = issuedAt.toISOString().slice(0, 10).replaceAll("-", "");
  return `R${date}${String(branchId).padStart(3, "0")}${String(paymentId).padStart(8, "0")}`;
}

/** แปลงจำนวนเงินฐานสิบเป็นสตางค์โดยไม่ใช้ floating point เพื่อรักษาการปัดเศษเอกสารการเงิน */
function moneyToSatang(value: string): number {
  const parsed = moneySchema.safeParse(value);
  if (!parsed.success) throw new ReceiptError("RECEIPT_AMOUNT_INVALID");
  const [whole, fraction = ""] = value.split(".");
  const satang = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(satang))
    throw new ReceiptError("RECEIPT_AMOUNT_INVALID");
  return satang;
}

/** แปลงสตางค์กลับเป็นเลขฐานสิบสองตำแหน่งสำหรับบันทึกลง DECIMAL และแสดงผลสม่ำเสมอ */
function formatSatang(value: number): string {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

/** แยก VAT จากราคารวมด้วย integer arithmetic แล้วให้ผลรวม subtotal + VAT เท่ากับยอดรับเงินจริงทุกครั้ง */
export function calculateInclusiveVat(totalAmount: string, vatRate: string) {
  const totalSatang = moneyToSatang(totalAmount);
  const rateMatch = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(vatRate);
  if (!rateMatch) throw new ReceiptError("RECEIPT_VAT_RATE_INVALID");
  const rateBasisPoints =
    Number(rateMatch[1]) * 100 + Number((rateMatch[2] ?? "").padEnd(2, "0"));
  if (rateBasisPoints < 0 || rateBasisPoints > 10_000)
    throw new ReceiptError("RECEIPT_VAT_RATE_INVALID");
  const vatSatang =
    rateBasisPoints === 0
      ? 0
      : Math.round(
          (totalSatang * rateBasisPoints) / (10_000 + rateBasisPoints),
        );
  return {
    subtotalExVat: formatSatang(totalSatang - vatSatang),
    vatAmount: formatSatang(vatSatang),
    totalAmount: formatSatang(totalSatang),
    vatRate: `${Math.floor(rateBasisPoints / 100)}.${String(rateBasisPoints % 100).padStart(2, "0")}`,
  };
}

/** สร้าง snapshot เอกสารจากข้อมูล ณ เวลารับชำระ เพื่อให้การแก้สมาชิก สาขา ราคา หรือ VAT ภายหลังไม่ย้อนเปลี่ยนเอกสารเดิม */
export function buildReceiptSnapshot(
  rawInput: z.input<typeof receiptBuildSchema>,
): ReceiptSnapshot {
  const parsed = receiptBuildSchema.safeParse(rawInput);
  if (!parsed.success) throw new ReceiptError("RECEIPT_INPUT_INVALID");
  const input = parsed.data;
  const wantsTaxInvoice = input.taxInvoice !== undefined;
  const settings = input.settings;
  if (
    wantsTaxInvoice &&
    (!settings?.vatRegistered ||
      !settings.taxId ||
      !taxIdSchema.safeParse(settings.taxId).success ||
      !settings.address)
  ) {
    throw new ReceiptError("TAX_SELLER_SETTINGS_REQUIRED");
  }

  const vatRegistered = settings?.vatRegistered === true;
  const totals = calculateInclusiveVat(
    input.totalAmount,
    vatRegistered ? settings.vatRate : "0.00",
  );
  return {
    receiptNumber: input.receiptNumber,
    documentType: wantsTaxInvoice ? "TAX_INVOICE" : "RECEIPT",
    issuedAt: input.issuedAt,
    sellerName: settings?.legalName ?? input.branch.name,
    sellerTaxId: settings?.taxId || null,
    sellerBranchNumber: settings?.branchNumber ?? null,
    sellerAddress: settings?.address ?? input.branch.address ?? null,
    sellerPhone: settings?.phone ?? input.branch.phone ?? null,
    buyerName: input.taxInvoice?.buyerName ?? input.memberName,
    buyerTaxId: input.taxInvoice?.buyerTaxId ?? null,
    buyerAddress: input.taxInvoice?.buyerAddress ?? null,
    itemDescription: `แพ็กเกจสมาชิก: ${input.packageName}`,
    quantity: 1,
    ...totals,
    paymentMethod: input.paymentMethod,
  };
}
