import { db } from "@/db";
import { members } from "@/db/schema";
import { MembersTable } from "@/components/members/members-table";
import { AddMemberDialog } from "@/components/members/add-member-dialog";

export default async function MembersPage() {
  const data = await db.select().from(members);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-balance text-2xl font-bold sm:text-3xl">สมาชิก</h1>
          <p className="text-muted-foreground text-sm">ทั้งหมด {data.length} คน</p>
        </div>
        <AddMemberDialog />
      </div>
      <MembersTable data={data} />
    </div>
  );
}
