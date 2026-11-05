import { ApplicationManager } from "@/components/members/application-manager";
import { getCurrentBranchId } from "@/lib/branch-service";
import { getMemberApplications } from "@/lib/member-portal-service";
import { requirePermission } from "@/lib/staff-service";

export const dynamic = "force-dynamic";
/** โหลดใบสมัครเฉพาะสาขาปัจจุบันหลังตรวจ RBAC */
export default async function MemberApplicationsPage() { const branchId = await getCurrentBranchId(); await requirePermission("members.manage", branchId); return <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8"><header><p className="text-sm font-medium text-primary">Online Signup</p><h1 className="text-2xl font-bold sm:text-3xl">ใบสมัครที่รอตรวจสอบ</h1><p className="mt-1 text-sm text-muted-foreground">การอนุมัติจะสร้างบัญชีสมาชิก แต่ยังต้องซื้อแพ็กเกจก่อนเข้าใช้บริการ</p></header><ApplicationManager applications={await getMemberApplications(branchId)} /></div>; }
