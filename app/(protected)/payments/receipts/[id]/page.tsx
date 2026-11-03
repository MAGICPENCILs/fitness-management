import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintReceiptButton } from "@/components/payments/print-receipt-button";
import { getCurrentBranchId } from "@/lib/branch-service";
import { getReceiptForPrint } from "@/lib/receipt-data";
import { requirePermission } from "@/lib/staff-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "เอกสารรับชำระ | Fitness Pro",
  description: "ใบเสร็จรับเงินหรือใบกำกับภาษีสำหรับพิมพ์",
};

const paymentLabels = {
  CASH: "เงินสด",
  QR_PROMPTPAY: "QR PromptPay",
  TRANSFER: "โอนเงิน",
  CREDIT_CARD: "บัตรเครดิต/เดบิต",
} as const;

const money = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  minimumFractionDigits: 2,
});

/** โหลด snapshot เอกสารตามสาขาและสิทธิ์ เพื่อให้ข้อมูลบนเอกสารไม่เปลี่ยนตามข้อมูลปัจจุบัน */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const branchId = await getCurrentBranchId();
  await requirePermission("payments.manage", branchId);
  const receiptId = Number((await params).id);
  if (!Number.isInteger(receiptId) || receiptId < 1) notFound();
  const receipt = await getReceiptForPrint(branchId, receiptId);
  if (!receipt) notFound();

  return (
    <div className="min-h-full bg-muted/30 p-4 sm:p-8">
      <div className="print-hidden mx-auto mb-4 flex max-w-[210mm] justify-end">
        <PrintReceiptButton />
      </div>
      <article className="receipt-print-page mx-auto min-h-[270mm] max-w-[210mm] bg-white p-6 text-zinc-950 shadow-sm sm:p-10" aria-label={receipt.documentType === "TAX_INVOICE" ? "ใบกำกับภาษี" : "ใบเสร็จรับเงิน"}>
        <header className="border-b-2 border-zinc-900 pb-6 text-center">
          <h1 className="text-2xl font-bold">{receipt.documentType === "TAX_INVOICE" ? "ใบเสร็จรับเงิน / ใบกำกับภาษี" : "ใบเสร็จรับเงิน"}</h1>
          <p className="mt-3 text-lg font-semibold">{receipt.sellerName}</p>
          {receipt.sellerAddress ? <p className="mt-1 text-sm">{receipt.sellerAddress}</p> : null}
          <p className="mt-1 text-sm">
            {receipt.sellerTaxId ? `เลขผู้เสียภาษี ${receipt.sellerTaxId}` : ""}
            {receipt.sellerBranchNumber ? ` · สาขา ${receipt.sellerBranchNumber}` : ""}
            {receipt.sellerPhone ? ` · โทร ${receipt.sellerPhone}` : ""}
          </p>
        </header>

        <section className="grid gap-2 border-b py-5 text-sm sm:grid-cols-2">
          <p><span className="font-semibold">เลขที่:</span> {receipt.receiptNumber}</p>
          <p className="sm:text-right"><span className="font-semibold">วันที่:</span> {receipt.issuedAt.toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short" })}</p>
          <p><span className="font-semibold">ผู้ซื้อ:</span> {receipt.buyerName}</p>
          {receipt.buyerTaxId ? <p className="sm:text-right"><span className="font-semibold">เลขผู้เสียภาษี:</span> {receipt.buyerTaxId}</p> : null}
          {receipt.buyerAddress ? <p className="sm:col-span-2"><span className="font-semibold">ที่อยู่:</span> {receipt.buyerAddress}</p> : null}
        </section>

        <table className="mt-6 w-full border-collapse text-sm">
          <thead><tr className="border-y border-zinc-900"><th className="p-3 text-left">รายการ</th><th className="p-3 text-center">จำนวน</th><th className="p-3 text-right">จำนวนเงิน</th></tr></thead>
          <tbody><tr className="border-b"><td className="p-3">{receipt.itemDescription}</td><td className="p-3 text-center">{receipt.quantity}</td><td className="p-3 text-right tabular-nums">{money.format(Number(receipt.totalAmount))}</td></tr></tbody>
        </table>

        <dl className="ml-auto mt-6 max-w-sm space-y-2 text-sm">
          <div className="flex justify-between gap-8"><dt>มูลค่าก่อน VAT</dt><dd className="tabular-nums">{money.format(Number(receipt.subtotalExVat))}</dd></div>
          <div className="flex justify-between gap-8"><dt>VAT {Number(receipt.vatRate).toLocaleString("th-TH")} %</dt><dd className="tabular-nums">{money.format(Number(receipt.vatAmount))}</dd></div>
          <div className="flex justify-between gap-8 border-t-2 border-zinc-900 pt-3 text-base font-bold"><dt>รวมทั้งสิ้น</dt><dd className="tabular-nums">{money.format(Number(receipt.totalAmount))}</dd></div>
          <div className="flex justify-between gap-8 pt-2"><dt>ชำระโดย</dt><dd>{paymentLabels[receipt.paymentMethod]}</dd></div>
        </dl>

        <footer className="mt-16 border-t pt-4 text-center text-xs text-zinc-600">เอกสารนี้สร้างจากข้อมูล ณ เวลารับชำระ และเก็บประวัติตามข้อกำหนดทางบัญชี</footer>
      </article>
    </div>
  );
}
