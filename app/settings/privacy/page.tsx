import { PrivacyManager } from "@/components/privacy/privacy-manager";
import { getBranchContext } from "@/lib/branch-service";
import { getPrivacyRequests } from "@/lib/privacy-service";
import { hasPermission } from "@/lib/rbac";
import { getStaffContext, requirePermission } from "@/lib/staff-service";

/** รวมคำขอ privacy กับชื่อสาขาและพนักงาน โดยยังคงใช้ขอบเขต RBAC จาก service */
export default async function PrivacySettingsPage() {
  const actor = await requirePermission("privacy.request.create");
  const [data, branchContext, staffContext] = await Promise.all([
    getPrivacyRequests(actor, { page: 1, pageSize: 100 }),
    getBranchContext(),
    getStaffContext(),
  ]);
  const branchNames = new Map(
    branchContext.branches.map((branch) => [branch.id, branch.name]),
  );
  const staffNames = new Map(
    staffContext.availableStaff.map((row) => [row.id, row.displayName]),
  );
  const requests = data.rows.map((row) => ({
    id: row.id,
    memberId: row.memberId,
    memberCode: row.memberCode,
    memberName: `${row.memberFirstName} ${row.memberLastName}`.trim(),
    branchId: row.branchId,
    branchName: branchNames.get(row.branchId) ?? `สาขา #${row.branchId}`,
    status: row.status,
    reason: row.reason,
    requestedByStaffId: row.requestedByStaffId,
    requestedByName:
      staffNames.get(row.requestedByStaffId) ??
      `พนักงาน #${row.requestedByStaffId}`,
    requestedAt: row.requestedAt,
    fileCleanupStatus: row.fileCleanupStatus,
  }));
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header><p className="text-sm font-medium text-primary">PDPA Operations</p><h1 className="text-balance text-2xl font-bold sm:text-3xl">คำขอความเป็นส่วนตัว</h1><p className="mt-1 text-pretty text-muted-foreground">พิจารณา anonymization และติดตามงานลบไฟล์โดยไม่ลบประวัติธุรกรรม</p></header>
      <PrivacyManager
        requests={requests}
        permissions={{
          canApprove: hasPermission(actor, "privacy.request.approve"),
          canCreate: hasPermission(actor, "privacy.request.create"),
          canRetryCleanup: hasPermission(actor, "privacy.request.approve"),
        }}
      />
    </div>
  );
}
