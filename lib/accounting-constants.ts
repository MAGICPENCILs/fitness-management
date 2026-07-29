export const expenseCategoryLabels = {
  WATER: "ค่าน้ำ",
  ELECTRICITY: "ค่าไฟ",
  SALARY: "เงินเดือน",
  REPAIR: "ค่าซ่อมบำรุง",
  SUPPLIES: "ค่าสินค้าและอุปกรณ์",
  OTHER: "ค่าใช้จ่ายอื่น",
} as const;

export const accountingMethodLabels = {
  CASH: "เงินสด",
  QR_PROMPTPAY: "QR PromptPay",
  TRANSFER: "โอนเงิน",
  CREDIT_CARD: "บัตรเครดิต",
} as const;

export type ExpenseCategory = keyof typeof expenseCategoryLabels;
