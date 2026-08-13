import { redirect } from "next/navigation";

import { Sidebar } from "@/components/sidebar";
import { getBranchContext } from "@/lib/branch-service";
import {
  requireFullSession,
  SessionAuthenticationError,
} from "@/lib/auth/session-service";
import { getStaffContext } from "@/lib/staff-service";

/** ตรวจ authoritative session ก่อนโหลด application shell และปล่อยข้อผิดพลาดระบบให้ error boundary ตอบ 500 ตามจริง */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireFullSession();
  } catch (error) {
    if (error instanceof SessionAuthenticationError) {
      if (error.reason === "PASSWORD_CHANGE_REQUIRED") {
        redirect("/change-password");
      }
      if (error.status === 401) redirect("/login");
    }
    throw error;
  }

  const [branchContext, staffContext] = await Promise.all([
    getBranchContext(),
    getStaffContext(),
  ]);

  return (
    <>
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:translate-y-0"
      >
        ข้ามไปยังเนื้อหาหลัก
      </a>
      <div className="min-h-dvh bg-background">
        <Sidebar
          branches={branchContext.branches}
          currentBranchId={branchContext.current.id}
          currentStaff={staffContext.staff}
          availableStaff={staffContext.availableStaff}
          devSwitcherEnabled={staffContext.devSwitcherEnabled}
          permissions={staffContext.permissions}
        />
        <main id="main-content" tabIndex={-1} className="min-w-0 md:pl-64">
          {children}
        </main>
      </div>
    </>
  );
}
