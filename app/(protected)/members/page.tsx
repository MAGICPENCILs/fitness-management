import { db } from "@/db";
import { members } from "@/db/schema";
import { MembersTable } from "@/components/members/members-table";
import { AddMemberDialog } from "@/components/members/add-member-dialog";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { eq } from "drizzle-orm";
import { getCurrentBranchId } from "@/lib/branch-service";
import { requirePermission } from "@/lib/staff-service";

export default async function MembersPage() {
  const branchId = await getCurrentBranchId();
  await requirePermission("members.manage", branchId);
  const data = await db.select().from(members).where(eq(members.homeBranchId, branchId));

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-1 text-sm font-medium text-primary">ฐานข้อมูลลูกค้า</p>
          <h1 className="text-balance text-2xl font-bold sm:text-3xl">สมาชิก</h1>
          <p className="text-muted-foreground text-sm">ทั้งหมด {data.length} คน</p>
        </div>
        <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/members/applications"><ClipboardList className="size-4" />ใบสมัครออนไลน์</Link></Button><AddMemberDialog /></div>
      </div>
      <div className="overflow-hidden rounded-xl border border-primary/15 bg-card shadow-sm">
        <MembersTable data={data} />
      </div>
    </div>
  );
}
