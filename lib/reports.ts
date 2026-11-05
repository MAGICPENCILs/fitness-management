import "server-only";

import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { accessLogs, attendancePunches, members, payments, payrollSummaries, promotions, receipts, staff } from "@/db/schema";
import { buildCsv, type ReportType } from "@/lib/report-policy";

type ReportRange = { from: string; to: string; start: Date; endExclusive: Date };

/** โหลดชุดรายงานทั้งหมดโดยบังคับ branch/date predicate ที่ query ต้นทางทุกชุด */
export async function getAdvancedReports(branchId: number, range: ReportRange) {
  const [memberStatuses, newMemberRows, peakRows, promotionRows, vatRows, attendanceRows, payrollRows] = await Promise.all([
    db.select({ status: members.status, count: sql<number>`count(${members.id})` }).from(members).where(eq(members.homeBranchId, branchId)).groupBy(members.status),
    db.select({ count: sql<number>`count(${members.id})` }).from(members).where(and(eq(members.homeBranchId, branchId), gte(members.createdAt, range.start), lt(members.createdAt, range.endExclusive))),
    db.select({ hour: sql<number>`hour(${accessLogs.scannedAt})`, visits: sql<number>`count(${accessLogs.id})` }).from(accessLogs).where(and(eq(accessLogs.branchId, branchId), eq(accessLogs.result, "APPROVED"), gte(accessLogs.scannedAt, range.start), lt(accessLogs.scannedAt, range.endExclusive))).groupBy(sql`hour(${accessLogs.scannedAt})`).orderBy(sql`hour(${accessLogs.scannedAt})`),
    db.select({ id: promotions.id, name: promotions.name, uses: sql<number>`count(${payments.id})`, discount: sql<string>`coalesce(sum(${payments.discountAmount}), 0)`, revenue: sql<string>`coalesce(sum(${payments.amount}), 0)` }).from(payments).innerJoin(promotions, eq(payments.promotionId, promotions.id)).where(and(eq(payments.branchId, branchId), eq(payments.status, "PAID"), gte(payments.createdAt, range.start), lt(payments.createdAt, range.endExclusive))).groupBy(promotions.id, promotions.name).orderBy(sql`count(${payments.id}) desc`),
    db.select({ documents: sql<number>`count(${receipts.id})`, subtotal: sql<string>`coalesce(sum(${receipts.subtotalExVat}), 0)`, vat: sql<string>`coalesce(sum(${receipts.vatAmount}), 0)`, total: sql<string>`coalesce(sum(${receipts.totalAmount}), 0)` }).from(receipts).where(and(eq(receipts.branchId, branchId), gte(receipts.issuedAt, range.start), lt(receipts.issuedAt, range.endExclusive))),
    db.select({ staffId: staff.id, staffCode: staff.staffCode, firstName: staff.firstName, lastName: staff.lastName, inCount: sql<number>`sum(case when ${attendancePunches.punchType} = 'IN' then 1 else 0 end)`, outCount: sql<number>`sum(case when ${attendancePunches.punchType} = 'OUT' then 1 else 0 end)` }).from(staff).leftJoin(attendancePunches, and(eq(attendancePunches.staffId, staff.id), eq(attendancePunches.branchId, branchId), gte(attendancePunches.punchedAt, range.start), lt(attendancePunches.punchedAt, range.endExclusive))).where(eq(staff.homeBranchId, branchId)).groupBy(staff.id, staff.staffCode, staff.firstName, staff.lastName).orderBy(staff.staffCode),
    db.select({ staffId: payrollSummaries.staffId, total: sql<string>`coalesce(sum(${payrollSummaries.totalAmount}), 0)` }).from(payrollSummaries).where(and(eq(payrollSummaries.branchId, branchId), eq(payrollSummaries.status, "APPROVED"), gte(payrollSummaries.approvedAt, range.start), lt(payrollSummaries.approvedAt, range.endExclusive))).groupBy(payrollSummaries.staffId),
  ]);

  const payrollByStaff = new Map(payrollRows.map((row) => [row.staffId, Number(row.total)]));
  const statuses = memberStatuses.map((row) => ({ status: row.status, count: Number(row.count) }));
  return {
    period: { from: range.from, to: range.to },
    members: { total: statuses.reduce((sum, row) => sum + row.count, 0), newInPeriod: Number(newMemberRows[0]?.count ?? 0), statuses },
    peakHours: peakRows.map((row) => ({ hour: Number(row.hour), visits: Number(row.visits) })),
    promotions: promotionRows.map((row) => ({ id: row.id, name: row.name, uses: Number(row.uses), discount: Number(row.discount), revenue: Number(row.revenue) })),
    vat: { documents: Number(vatRows[0]?.documents ?? 0), subtotal: Number(vatRows[0]?.subtotal ?? 0), vat: Number(vatRows[0]?.vat ?? 0), total: Number(vatRows[0]?.total ?? 0) },
    workforce: attendanceRows.map((row) => ({ ...row, inCount: Number(row.inCount), outCount: Number(row.outCount), approvedPayroll: payrollByStaff.get(row.staffId) ?? 0 })),
  };
}

export type AdvancedReports = Awaited<ReturnType<typeof getAdvancedReports>>;

/** แปลงรายงานที่เลือกเป็น CSV โดยใช้ข้อมูล scoped ชุดเดียวกับหน้าเว็บ */
export function exportReportCsv(type: ReportType, report: AdvancedReports) {
  const rows: Array<Array<string | number | null>> = type === "members"
    ? [["สถานะสมาชิก", "จำนวน"], ...report.members.statuses.map((row) => [row.status, row.count]), ["สมาชิกใหม่ในช่วง", report.members.newInPeriod], ["สมาชิกทั้งหมด", report.members.total]]
    : type === "peak-hours"
      ? [["ชั่วโมง", "จำนวนเข้าใช้"], ...report.peakHours.map((row) => [`${String(row.hour).padStart(2, "0")}:00`, row.visits])]
      : type === "promotions"
        ? [["โปรโมชัน", "ครั้งที่ใช้", "ส่วนลด", "รายรับ"], ...report.promotions.map((row) => [row.name, row.uses, row.discount.toFixed(2), row.revenue.toFixed(2)])]
        : type === "vat"
          ? [["จำนวนเอกสาร", "มูลค่าก่อน VAT", "VAT", "ยอดรวม"], [report.vat.documents, report.vat.subtotal.toFixed(2), report.vat.vat.toFixed(2), report.vat.total.toFixed(2)]]
          : [["รหัสพนักงาน", "ชื่อ", "IN", "OUT", "Payroll อนุมัติแล้ว"], ...report.workforce.map((row) => [row.staffCode, `${row.firstName} ${row.lastName}`.trim(), row.inCount, row.outCount, row.approvedPayroll.toFixed(2)])];
  return buildCsv(rows);
}
