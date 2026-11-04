import "server-only";

import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { attendanceCorrections, attendancePunches, commissionLedger, compensationProfiles, payrollSummaries, staff } from "@/db/schema";
import { runAuditedMutation } from "@/lib/audit-service";
import type { ActorContext } from "@/lib/rbac";
import { assertPayrollPeriod, calculatePayrollAmounts, nextAttendancePunch } from "@/lib/workforce-policy";

export class WorkforceError extends Error {
  constructor(public code: string) { super(code); this.name = "WorkforceError"; }
}

/** บันทึก punch ถัดไปของพนักงานปัจจุบัน โดยล็อก latest row เพื่อลด punch ซ้ำพร้อมกัน */
export async function punchAttendance(actor: ActorContext, branchId: number) {
  return runAuditedMutation<number>(
    { actorStaffId: actor.staffId, branchId, action: "ATTENDANCE_PUNCHED", entityType: "ATTENDANCE", success: (id) => ({ entityId: id }) },
    async (tx) => {
      await tx.select({ id: staff.id }).from(staff).where(eq(staff.id, actor.staffId)).limit(1).for("update");
      const [latest] = await tx.select({ punchType: attendancePunches.punchType }).from(attendancePunches).where(eq(attendancePunches.staffId, actor.staffId)).orderBy(desc(attendancePunches.punchedAt)).limit(1).for("update");
      const result = await tx.insert(attendancePunches).values({ staffId: actor.staffId, branchId, punchType: nextAttendancePunch(latest?.punchType ?? null), punchedAt: new Date(), source: "SELF" });
      return result[0].insertId;
    },
  );
}

/** โหลดพนักงาน ค่าตอบแทน เวลา และ payroll เฉพาะสาขาปัจจุบัน */
export async function getWorkforceDashboard(branchId: number) {
  const [staffRows, punches, payroll] = await Promise.all([
    db.select({ id: staff.id, staffCode: staff.staffCode, firstName: staff.firstName, lastName: staff.lastName, role: staff.role, status: staff.status, baseSalary: compensationProfiles.baseSalary, commissionRateBasisPoints: compensationProfiles.commissionRateBasisPoints }).from(staff).leftJoin(compensationProfiles, eq(compensationProfiles.staffId, staff.id)).where(eq(staff.homeBranchId, branchId)).orderBy(staff.firstName),
    db.select({ id: attendancePunches.id, staffId: attendancePunches.staffId, punchType: attendancePunches.punchType, punchedAt: attendancePunches.punchedAt, source: attendancePunches.source }).from(attendancePunches).where(eq(attendancePunches.branchId, branchId)).orderBy(desc(attendancePunches.punchedAt)).limit(100),
    db.select().from(payrollSummaries).where(eq(payrollSummaries.branchId, branchId)).orderBy(desc(payrollSummaries.createdAt)).limit(50),
  ]);
  return { staff: staffRows, punches, payroll };
}

/** บันทึกฐานเงินเดือนและอัตรา commission เป็น basis points โดยไม่คำนวณภาษี payroll */
export async function saveCompensation(actor: ActorContext, branchId: number, staffId: number, input: { baseSalary: string; commissionRateBasisPoints: number }) {
  return runAuditedMutation(
    { actorStaffId: actor.staffId, branchId, action: "COMPENSATION_UPDATED", entityType: "STAFF", entityId: staffId },
    async (tx) => {
      const [target] = await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.id, staffId), eq(staff.homeBranchId, branchId))).limit(1);
      if (!target) throw new WorkforceError("STAFF_NOT_FOUND");
      return tx.insert(compensationProfiles).values({ staffId, baseSalary: input.baseSalary, commissionRateBasisPoints: input.commissionRateBasisPoints, updatedByStaffId: actor.staffId }).onDuplicateKeyUpdate({ set: { baseSalary: input.baseSalary, commissionRateBasisPoints: input.commissionRateBasisPoints, updatedByStaffId: actor.staffId } });
    },
  );
}

/** แก้เวลา punch พร้อมสร้าง correction ledger ที่เก็บค่าก่อนแก้และเหตุผล */
export async function correctAttendance(actor: ActorContext, branchId: number, punchId: number, correctedAt: Date, reason: string) {
  return runAuditedMutation(
    { actorStaffId: actor.staffId, branchId, action: "ATTENDANCE_CORRECTED", entityType: "ATTENDANCE", entityId: punchId },
    async (tx) => {
      const [punch] = await tx.select().from(attendancePunches).where(and(eq(attendancePunches.id, punchId), eq(attendancePunches.branchId, branchId))).limit(1).for("update");
      if (!punch) throw new WorkforceError("PUNCH_NOT_FOUND");
      await tx.insert(attendanceCorrections).values({ attendancePunchId: punch.id, correctedByStaffId: actor.staffId, originalPunchedAt: punch.punchedAt, correctedPunchedAt: correctedAt, reason });
      await tx.update(attendancePunches).set({ punchedAt: correctedAt, source: "ADMIN_CORRECTION" }).where(eq(attendancePunches.id, punch.id));
    },
  );
}

/** สร้าง payroll draft จาก profile + commission ledger โดยล็อกพนักงานและห้ามช่วงที่ซ้อนกัน */
export async function createPayrollDraft(actor: ActorContext, branchId: number, staffId: number, periodStart: string, periodEnd: string) {
  assertPayrollPeriod(periodStart, periodEnd);
  const startDate = new Date(`${periodStart}T00:00:00`);
  const endDate = new Date(`${periodEnd}T00:00:00`);
  return runAuditedMutation<number>(
    { actorStaffId: actor.staffId, branchId, action: "PAYROLL_DRAFT_CREATED", entityType: "PAYROLL", success: (id) => ({ entityId: id }) },
    async (tx) => {
      const [target] = await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.id, staffId), eq(staff.homeBranchId, branchId))).limit(1).for("update");
      if (!target) throw new WorkforceError("STAFF_NOT_FOUND");
      const [overlap] = await tx.select({ id: payrollSummaries.id }).from(payrollSummaries).where(and(eq(payrollSummaries.staffId, staffId), inArray(payrollSummaries.status, ["DRAFT", "APPROVED"]), lte(payrollSummaries.periodStart, endDate), gte(payrollSummaries.periodEnd, startDate))).limit(1);
      if (overlap) throw new WorkforceError("PAYROLL_PERIOD_OVERLAP");
      const [profile] = await tx.select({ baseSalary: compensationProfiles.baseSalary }).from(compensationProfiles).innerJoin(staff, eq(compensationProfiles.staffId, staff.id)).where(and(eq(compensationProfiles.staffId, staffId), eq(staff.homeBranchId, branchId))).limit(1);
      if (!profile) throw new WorkforceError("COMPENSATION_NOT_FOUND");
      const from = new Date(`${periodStart}T00:00:00`); const to = new Date(`${periodEnd}T23:59:59`);
      const [commission] = await tx.select({ total: sql<string>`coalesce(sum(${commissionLedger.commissionAmount}), 0)` }).from(commissionLedger).where(and(eq(commissionLedger.staffId, staffId), gte(commissionLedger.createdAt, from), lte(commissionLedger.createdAt, to)));
      const amounts = calculatePayrollAmounts(profile.baseSalary, commission?.total ?? "0");
      const result = await tx.insert(payrollSummaries).values({ staffId, branchId, periodStart: startDate, periodEnd: endDate, baseSalary: profile.baseSalary, ...amounts, status: "DRAFT" });
      return result[0].insertId;
    },
  );
}

/** อนุมัติ payroll draft แบบ manual และไม่อนุญาตแก้ผลอนุมัติซ้ำ */
export async function approvePayroll(actor: ActorContext, branchId: number, payrollId: number) {
  return runAuditedMutation(
    { actorStaffId: actor.staffId, branchId, action: "PAYROLL_APPROVED", entityType: "PAYROLL", entityId: payrollId },
    async (tx) => {
      const result = await tx.update(payrollSummaries).set({ status: "APPROVED", approvedByStaffId: actor.staffId, approvedAt: new Date() }).where(and(eq(payrollSummaries.id, payrollId), eq(payrollSummaries.branchId, branchId), eq(payrollSummaries.status, "DRAFT")));
      if (result[0].affectedRows !== 1) throw new WorkforceError("PAYROLL_NOT_DRAFT");
    },
  );
}
