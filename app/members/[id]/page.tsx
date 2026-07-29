import { db } from "@/db";
import { members, memberPackages, packages, cardPool } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MemberDetail } from "@/components/members/member-detail";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const member = await db
    .select()
    .from(members)
    .where(eq(members.id, Number(id)))
    .limit(1);

  if (member.length === 0) notFound();

  const memberPkgs = await db
    .select({
      id:          memberPackages.id,
      packageName: packages.name,
      startDate:   memberPackages.startDate,
      expireDate:  memberPackages.expireDate,
      status:      memberPackages.status,
      paidAmount:  memberPackages.paidAmount,
    })
    .from(memberPackages)
    .innerJoin(packages, eq(memberPackages.packageId, packages.id))
    .where(eq(memberPackages.memberId, Number(id)));

  const assignedCards = await db
    .select()
    .from(cardPool)
    .where(eq(cardPool.memberId, Number(id)));

  const availableCards = await db
    .select()
    .from(cardPool)
    .where(eq(cardPool.status, "AVAILABLE"));

  return (
    <MemberDetail
      member={member[0]}
      packages={memberPkgs}
      assignedCard={assignedCards[0] ?? null}
      availableCards={availableCards}
    />
  );
}