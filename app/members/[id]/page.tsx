import { db } from "@/db";
import { members, memberPackages, packages, cardPool } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MemberDetail } from "@/components/members/member-detail";
import { getCurrentBranchId } from "@/lib/branch-service";
import { getMemberConsentSnapshot } from "@/lib/privacy-service";
import { hasPermission } from "@/lib/rbac";
import { getStaffContext, requirePermission } from "@/lib/staff-service";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const branchId = await getCurrentBranchId();

  const member = await db
    .select()
    .from(members)
    .where(eq(members.id, Number(id)))
    .limit(1);

  if (member.length === 0) notFound();
  const actor = await requirePermission("members.manage", member[0].homeBranchId);

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
    .where(and(eq(cardPool.branchId, branchId), eq(cardPool.status, "AVAILABLE")));

  const [consents, staffContext] = await Promise.all([
    getMemberConsentSnapshot(Number(id), actor),
    getStaffContext(),
  ]);
  const actorNames = new Map(
    staffContext.availableStaff.map((row) => [row.id, row.displayName]),
  );
  const privacySnapshot = {
    SERVICE_PRIVACY: null,
    MARKETING: null,
    PHOTO: null,
  } as Record<
    "SERVICE_PRIVACY" | "MARKETING" | "PHOTO",
    {
      granted: boolean;
      policyVersion: string;
      updatedAt: string | null;
      actorName: string;
    } | null
  >;
  for (const event of consents.events)
    privacySnapshot[event.consentType] = {
      granted: event.action === "GRANTED",
      policyVersion: event.policyVersion,
      updatedAt: event.createdAt,
      actorName:
        actorNames.get(event.recordedByStaffId) ??
        `พนักงาน #${event.recordedByStaffId}`,
    };

  return (
    <MemberDetail
      member={member[0]}
      packages={memberPkgs}
      assignedCard={assignedCards[0] ?? null}
      availableCards={availableCards}
      privacySnapshot={privacySnapshot}
      canManagePrivacy={hasPermission(
        actor,
        "privacy.consent.manage",
        member[0].homeBranchId,
      )}
    />
  );
}
