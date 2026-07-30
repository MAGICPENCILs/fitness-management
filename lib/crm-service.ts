import { and, desc, eq, max, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accessLogs,
  crmInteractions,
  loyaltyPoints,
  loyaltyRewards,
  memberCrmProfiles,
  members,
} from "@/db/schema";
import { withTransaction, type DbTransaction } from "@/lib/audit-service";

export class CrmOperationError extends Error {
  /** สร้างข้อผิดพลาดทางธุรกิจพร้อม HTTP status ที่ route handler นำไปใช้ได้ตรงกัน */
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "CrmOperationError";
  }
}

/** รวมข้อมูลสมาชิก การติดตาม คะแนน และรางวัลสำหรับหน้า CRM โดยถือว่าไม่เข้าใช้เกิน 30 วันคือ inactive */
export async function getCrmDashboard() {
  const [memberRows, interactionRows, rewardRows, balanceRows, lastVisitRows] =
    await Promise.all([
      db
        .select({
          id: members.id,
          memberCode: members.memberCode,
          firstName: members.firstName,
          lastName: members.lastName,
          phone: members.phone,
          email: members.email,
          createdAt: members.createdAt,
          interests: memberCrmProfiles.interests,
          fitnessGoals: memberCrmProfiles.fitnessGoals,
          preferredContact: memberCrmProfiles.preferredContact,
        })
        .from(members)
        .leftJoin(memberCrmProfiles, eq(members.id, memberCrmProfiles.memberId))
        .where(eq(members.status, "ACTIVE"))
        .orderBy(members.memberCode),
      db
        .select({
          id: crmInteractions.id,
          memberId: crmInteractions.memberId,
          channel: crmInteractions.channel,
          summary: crmInteractions.summary,
          followUpDate: crmInteractions.followUpDate,
          status: crmInteractions.status,
          createdAt: crmInteractions.createdAt,
          memberCode: members.memberCode,
          firstName: members.firstName,
          lastName: members.lastName,
        })
        .from(crmInteractions)
        .innerJoin(members, eq(crmInteractions.memberId, members.id))
        .orderBy(desc(crmInteractions.createdAt)),
      db
        .select({
          id: loyaltyRewards.id,
          name: loyaltyRewards.name,
          description: loyaltyRewards.description,
          pointsRequired: loyaltyRewards.pointsRequired,
          stock: loyaltyRewards.stock,
        })
        .from(loyaltyRewards)
        .where(eq(loyaltyRewards.isActive, true))
        .orderBy(loyaltyRewards.pointsRequired),
      db
        .select({
          memberId: loyaltyPoints.memberId,
          balance: sql<number>`coalesce(sum(${loyaltyPoints.points}), 0)`,
        })
        .from(loyaltyPoints)
        .groupBy(loyaltyPoints.memberId),
      db
        .select({
          memberId: accessLogs.memberId,
          lastVisit: max(accessLogs.scannedAt),
        })
        .from(accessLogs)
        .where(eq(accessLogs.result, "APPROVED"))
        .groupBy(accessLogs.memberId),
    ]);

  const balances = new Map(
    balanceRows.map((item) => [item.memberId, Number(item.balance)]),
  );
  const lastVisits = new Map(
    lastVisitRows.map((item) => [item.memberId, item.lastVisit]),
  );
  const inactiveCutoff = new Date();
  inactiveCutoff.setDate(inactiveCutoff.getDate() - 30);

  const dashboardMembers = memberRows.map((member) => {
    const lastVisit = lastVisits.get(member.id) ?? null;
    const activityReference = lastVisit ?? member.createdAt;
    return {
      ...member,
      createdAt: member.createdAt?.toISOString() ?? null,
      preferredContact: member.preferredContact ?? "PHONE",
      points: balances.get(member.id) ?? 0,
      lastVisit: lastVisit?.toISOString() ?? null,
      isInactive: Boolean(activityReference && activityReference < inactiveCutoff),
    };
  });
  const openInteractions = interactionRows
    .filter((item) => item.status === "OPEN")
    .map((item) => ({
      ...item,
      createdAt: item.createdAt?.toISOString() ?? null,
    }));

  return {
    members: dashboardMembers,
    interactions: openInteractions,
    rewards: rewardRows,
    summary: {
      profiledMembers: dashboardMembers.filter(
        (item) => item.interests || item.fitnessGoals,
      ).length,
      openFollowUps: openInteractions.length,
      outstandingPoints: dashboardMembers.reduce(
        (total, item) => total + item.points,
        0,
      ),
      inactiveMembers: dashboardMembers.filter((item) => item.isInactive).length,
    },
  };
}

/** บันทึกความสนใจและช่องทางติดต่อโดยใช้ upsert เพื่อให้สมาชิกหนึ่งคนมีโปรไฟล์ CRM เพียงชุดเดียว */
export async function saveMemberCrmProfile(input: {
  branchId: number;
  memberId: number;
  interests?: string;
  fitnessGoals?: string;
  preferredContact: "PHONE" | "LINE" | "SMS" | "EMAIL" | "NONE";
}, executor?: DbTransaction) {
  const database = executor ?? db;
  const [member] = await database
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.id, input.memberId), eq(members.homeBranchId, input.branchId)))
    .limit(1);
  if (!member) throw new CrmOperationError("ไม่พบสมาชิกที่ต้องการบันทึก", 404);

  await database
    .insert(memberCrmProfiles)
    .values({
      memberId: input.memberId,
      interests: input.interests || null,
      fitnessGoals: input.fitnessGoals || null,
      preferredContact: input.preferredContact,
    })
    .onDuplicateKeyUpdate({
      set: {
        interests: input.interests || null,
        fitnessGoals: input.fitnessGoals || null,
        preferredContact: input.preferredContact,
      },
    });
}

/** เพิ่มบันทึกการสื่อสารและเก็บวันติดตามถัดไปเป็นงานเปิดจนกว่าพนักงานจะปิดงาน */
export async function createCrmInteraction(input: {
  branchId: number;
  memberId: number;
  channel: "NOTE" | "PHONE" | "LINE" | "SMS" | "EMAIL" | "IN_PERSON";
  summary: string;
  followUpDate?: string;
}, executor?: DbTransaction) {
  const database = executor ?? db;
  const [member] = await database
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.id, input.memberId), eq(members.homeBranchId, input.branchId)))
    .limit(1);
  if (!member) throw new CrmOperationError("ไม่พบสมาชิกที่ต้องการติดตาม", 404);

  const result = await database.insert(crmInteractions).values({
    memberId: input.memberId,
    channel: input.channel,
    summary: input.summary,
    followUpDate: input.followUpDate || null,
  });
  return result[0].insertId;
}

/** ปิดงานติดตามเฉพาะรายการที่ยังเปิด เพื่อป้องกันการบันทึกเสร็จซ้ำ */
export async function completeCrmInteraction(interactionId: number, branchId: number, executor?: DbTransaction) {
  const database = executor ?? db;
  const [interaction] = await database
    .select({ id: crmInteractions.id })
    .from(crmInteractions)
    .innerJoin(members, eq(crmInteractions.memberId, members.id))
    .where(and(eq(crmInteractions.id, interactionId), eq(members.homeBranchId, branchId)))
    .limit(1);
  if (!interaction) throw new CrmOperationError("ไม่พบงานติดตามในสาขานี้", 404);
  const result = await database
    .update(crmInteractions)
    .set({ status: "COMPLETED", completedAt: new Date() })
    .where(
      and(
        eq(crmInteractions.id, interactionId),
        eq(crmInteractions.status, "OPEN"),
      ),
    );
  if (result[0].affectedRows !== 1)
    throw new CrmOperationError("งานติดตามนี้ถูกปิดแล้วหรือไม่พบรายการ", 409);
}

/** เพิ่มคะแนนเป็นรายการ ledger บวกเท่านั้น เพื่อให้ตรวจสอบที่มาของยอดคงเหลือย้อนหลังได้ */
export async function awardLoyaltyPoints(input: {
  branchId: number;
  memberId: number;
  points: number;
  source: string;
  note?: string;
}, executor?: DbTransaction) {
  return withTransaction(executor, async (tx) => {
    const [member] = await tx
      .select({ id: members.id, status: members.status })
      .from(members)
      .where(and(eq(members.id, input.memberId), eq(members.homeBranchId, input.branchId)))
      .limit(1)
      .for("update");
    if (!member || member.status !== "ACTIVE")
      throw new CrmOperationError("สมาชิกไม่อยู่ในสถานะที่รับคะแนนได้", 409);

    const result = await tx.insert(loyaltyPoints).values({
      memberId: input.memberId,
      points: input.points,
      source: input.source,
      type: "EARN",
      note: input.note || null,
    });
    return result[0].insertId;
  });
}

/** สร้างของรางวัลพร้อมกำหนดคะแนนและสต็อก โดยค่า null หมายถึงไม่จำกัดจำนวน */
export async function createLoyaltyReward(input: {
  name: string;
  description?: string;
  pointsRequired: number;
  stock?: number;
}, executor?: DbTransaction) {
  const result = await (executor ?? db).insert(loyaltyRewards).values({
    ...input,
    description: input.description || null,
    stock: input.stock ?? null,
  });
  return result[0].insertId;
}

/** แลกรางวัลใน transaction เดียว โดยล็อกสมาชิกและรางวัลก่อนตรวจยอดเพื่อไม่ให้คะแนนหรือสต็อกติดลบเมื่อทำพร้อมกัน */
export async function redeemLoyaltyReward(memberId: number, rewardId: number, branchId: number, executor?: DbTransaction) {
  return withTransaction(executor, async (tx) => {
    const [member] = await tx
      .select({ id: members.id, status: members.status })
      .from(members)
      .where(and(eq(members.id, memberId), eq(members.homeBranchId, branchId)))
      .limit(1)
      .for("update");
    if (!member || member.status !== "ACTIVE")
      throw new CrmOperationError("สมาชิกไม่อยู่ในสถานะที่แลกรางวัลได้", 409);

    const [reward] = await tx
      .select({
        id: loyaltyRewards.id,
        name: loyaltyRewards.name,
        pointsRequired: loyaltyRewards.pointsRequired,
        stock: loyaltyRewards.stock,
        isActive: loyaltyRewards.isActive,
      })
      .from(loyaltyRewards)
      .where(eq(loyaltyRewards.id, rewardId))
      .limit(1)
      .for("update");
    if (!reward || !reward.isActive)
      throw new CrmOperationError("รางวัลนี้ไม่เปิดให้แลก", 409);
    if (reward.stock !== null && reward.stock <= 0)
      throw new CrmOperationError("รางวัลนี้หมดสต็อกแล้ว", 409);

    const [balanceRow] = await tx
      .select({ balance: sql<number>`coalesce(sum(${loyaltyPoints.points}), 0)` })
      .from(loyaltyPoints)
      .where(eq(loyaltyPoints.memberId, memberId));
    const balance = Number(balanceRow?.balance ?? 0);
    if (balance < reward.pointsRequired)
      throw new CrmOperationError("คะแนนสะสมไม่เพียงพอสำหรับรางวัลนี้", 409);

    await tx.insert(loyaltyPoints).values({
      memberId,
      type: "REDEEM",
      points: -reward.pointsRequired,
      source: `แลกรางวัล: ${reward.name}`,
      rewardId,
    });
    if (reward.stock !== null)
      await tx
        .update(loyaltyRewards)
        .set({ stock: sql`${loyaltyRewards.stock} - 1` })
        .where(eq(loyaltyRewards.id, rewardId));

    return balance - reward.pointsRequired;
  });
}
