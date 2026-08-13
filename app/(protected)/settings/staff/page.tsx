import { StaffManager } from "@/components/staff/staff-manager";
import { getBranchContext } from "@/lib/branch-service";
import { getStaffContext, getStaffDashboard } from "@/lib/staff-service";

/** เตรียม staff dashboard จาก server-enforced RBAC ก่อนส่งข้อมูลที่ serializable ให้ client component */
export default async function StaffSettingsPage() {
  const [staff, branchContext, staffContext] = await Promise.all([
    getStaffDashboard(),
    getBranchContext(),
    getStaffContext(),
  ]);
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header><p className="text-sm font-medium text-primary">บัญชีและสิทธิ์</p><h1 className="text-balance text-2xl font-bold sm:text-3xl">จัดการพนักงาน</h1><p className="mt-1 text-pretty text-muted-foreground">เพิ่ม แก้ไข และควบคุมบทบาทพนักงานตามสาขา</p></header>
      <StaffManager
        staff={staff}
        branches={branchContext.branches.map((branch) => ({ id: branch.id, name: branch.name }))}
        actor={{ role: staffContext.staff.role as "OWNER" | "MANAGER", homeBranchId: staffContext.staff.homeBranchId }}
      />
    </div>
  );
}
