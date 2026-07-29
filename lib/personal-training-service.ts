import { and, desc, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  fitnessClasses,
  members,
  ptPackages,
  ptSessions,
  trainers,
} from "@/db/schema";

export class PersonalTrainingOperationError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "PersonalTrainingOperationError";
  }
}

/** คืนวันที่ปัจจุบันตามเวลาไทยสำหรับตรวจวันที่ทำรายการฝึก */
function getBangkokToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** โหลดแพ็กเกจ นัดหมาย และผลการฝึกพร้อมตัวเลือกสมาชิกกับเทรนเนอร์สำหรับหน้า PT */
export async function getPersonalTrainingDashboard() {
  const [packageRows, sessionRows, memberRows, trainerRows] = await Promise.all([
    db
      .select({
        id: ptPackages.id,
        memberId: ptPackages.memberId,
        trainerId: ptPackages.trainerId,
        name: ptPackages.name,
        totalSessions: ptPackages.totalSessions,
        startDate: ptPackages.startDate,
        endDate: ptPackages.endDate,
        status: ptPackages.status,
        note: ptPackages.note,
        memberCode: members.memberCode,
        memberFirstName: members.firstName,
        memberLastName: members.lastName,
        trainerCode: trainers.code,
        trainerFirstName: trainers.firstName,
        trainerLastName: trainers.lastName,
      })
      .from(ptPackages)
      .innerJoin(members, eq(ptPackages.memberId, members.id))
      .innerJoin(trainers, eq(ptPackages.trainerId, trainers.id))
      .orderBy(desc(ptPackages.createdAt)),
    db
      .select({
        id: ptSessions.id,
        packageId: ptSessions.packageId,
        scheduledDate: ptSessions.scheduledDate,
        startTime: ptSessions.startTime,
        endTime: ptSessions.endTime,
        status: ptSessions.status,
        weightKg: ptSessions.weightKg,
        bmi: ptSessions.bmi,
        waistCm: ptSessions.waistCm,
        workoutSummary: ptSessions.workoutSummary,
        trainerNote: ptSessions.trainerNote,
        completedAt: ptSessions.completedAt,
        cancelledAt: ptSessions.cancelledAt,
        memberCode: members.memberCode,
        memberFirstName: members.firstName,
        memberLastName: members.lastName,
        trainerCode: trainers.code,
        trainerFirstName: trainers.firstName,
        trainerLastName: trainers.lastName,
        packageName: ptPackages.name,
      })
      .from(ptSessions)
      .innerJoin(ptPackages, eq(ptSessions.packageId, ptPackages.id))
      .innerJoin(members, eq(ptPackages.memberId, members.id))
      .innerJoin(trainers, eq(ptPackages.trainerId, trainers.id))
      .orderBy(desc(ptSessions.scheduledDate), desc(ptSessions.startTime)),
    db
      .select({
        id: members.id,
        memberCode: members.memberCode,
        firstName: members.firstName,
        lastName: members.lastName,
      })
      .from(members)
      .where(eq(members.status, "ACTIVE"))
      .orderBy(members.memberCode),
    db
      .select({
        id: trainers.id,
        code: trainers.code,
        firstName: trainers.firstName,
        lastName: trainers.lastName,
        specialty: trainers.specialty,
      })
      .from(trainers)
      .where(eq(trainers.status, "ACTIVE"))
      .orderBy(trainers.code),
  ]);

  const counts = sessionRows.reduce<
    Record<number, { completed: number; scheduled: number }>
  >((result, session) => {
    result[session.packageId] ??= { completed: 0, scheduled: 0 };
    if (session.status === "COMPLETED") result[session.packageId].completed += 1;
    if (session.status === "SCHEDULED") result[session.packageId].scheduled += 1;
    return result;
  }, {});

  return {
    packages: packageRows.map((item) => ({
      ...item,
      completedCount: counts[item.id]?.completed ?? 0,
      scheduledCount: counts[item.id]?.scheduled ?? 0,
    })),
    sessions: sessionRows.map((item) => ({
      ...item,
      weightKg: item.weightKg ? Number(item.weightKg) : null,
      bmi: item.bmi ? Number(item.bmi) : null,
      waistCm: item.waistCm ? Number(item.waistCm) : null,
      completedAt: item.completedAt?.toISOString() ?? null,
      cancelledAt: item.cancelledAt?.toISOString() ?? null,
    })),
    members: memberRows,
    trainers: trainerRows,
  };
}

/** ออกสิทธิ์ PT หลังตรวจว่าสมาชิกและเทรนเนอร์อยู่ในสถานะพร้อมใช้งาน */
export async function createPtPackage(input: {
  memberId: number;
  trainerId: number;
  name: string;
  totalSessions: number;
  startDate: string;
  endDate: string;
  note?: string;
}) {
  const [[member], [trainer]] = await Promise.all([
    db
      .select({ status: members.status })
      .from(members)
      .where(eq(members.id, input.memberId))
      .limit(1),
    db
      .select({ status: trainers.status })
      .from(trainers)
      .where(eq(trainers.id, input.trainerId))
      .limit(1),
  ]);
  if (!member || member.status !== "ACTIVE")
    throw new PersonalTrainingOperationError("สมาชิกไม่อยู่ในสถานะที่ออก PT Package ได้");
  if (!trainer || trainer.status !== "ACTIVE")
    throw new PersonalTrainingOperationError("ไม่พบเทรนเนอร์ที่พร้อมรับแพ็กเกจ");

  const result = await db.insert(ptPackages).values({
    ...input,
    note: input.note || null,
  });
  return result[0].insertId;
}

/** นัด PT ภายใต้ transaction โดยกันสิทธิ์เกินจำนวนและตรวจเวลาชนทั้งคลาสกลุ่มกับ PT */
export async function schedulePtSession(
  packageId: number,
  input: {
    scheduledDate: string;
    startTime: string;
    endTime: string;
  },
) {
  return db.transaction(async (tx) => {
    const [ptPackage] = await tx
      .select({
        id: ptPackages.id,
        trainerId: ptPackages.trainerId,
        totalSessions: ptPackages.totalSessions,
        startDate: ptPackages.startDate,
        endDate: ptPackages.endDate,
        status: ptPackages.status,
      })
      .from(ptPackages)
      .where(eq(ptPackages.id, packageId))
      .limit(1)
      .for("update");
    if (!ptPackage || ptPackage.status !== "ACTIVE")
      throw new PersonalTrainingOperationError("PT Package นี้ไม่เปิดให้นัดหมาย", 409);
    if (
      input.scheduledDate < ptPackage.startDate ||
      input.scheduledDate > ptPackage.endDate
    )
      throw new PersonalTrainingOperationError(
        "วันนัดต้องอยู่ภายในช่วงอายุของ PT Package",
        400,
      );

    await tx
      .select({ id: trainers.id })
      .from(trainers)
      .where(eq(trainers.id, ptPackage.trainerId))
      .limit(1)
      .for("update");

    const reservedSessions = await tx
      .select({ id: ptSessions.id })
      .from(ptSessions)
      .where(
        and(
          eq(ptSessions.packageId, packageId),
          inArray(ptSessions.status, ["SCHEDULED", "COMPLETED"]),
        ),
      );
    if (reservedSessions.length >= ptPackage.totalSessions)
      throw new PersonalTrainingOperationError(
        "PT Package นี้ถูกใช้หรือนัดหมายครบจำนวนแล้ว",
        409,
      );

    const [[groupOverlap], [ptOverlap]] = await Promise.all([
      tx
        .select({ id: fitnessClasses.id })
        .from(fitnessClasses)
        .where(
          and(
            eq(fitnessClasses.trainerId, ptPackage.trainerId),
            eq(fitnessClasses.classDate, input.scheduledDate),
            ne(fitnessClasses.status, "CANCELLED"),
            lt(fitnessClasses.startTime, input.endTime),
            gt(fitnessClasses.endTime, input.startTime),
          ),
        )
        .limit(1),
      tx
        .select({ id: ptSessions.id })
        .from(ptSessions)
        .innerJoin(ptPackages, eq(ptSessions.packageId, ptPackages.id))
        .where(
          and(
            eq(ptPackages.trainerId, ptPackage.trainerId),
            eq(ptSessions.scheduledDate, input.scheduledDate),
            ne(ptSessions.status, "CANCELLED"),
            lt(ptSessions.startTime, input.endTime),
            gt(ptSessions.endTime, input.startTime),
          ),
        )
        .limit(1),
    ]);
    if (groupOverlap || ptOverlap)
      throw new PersonalTrainingOperationError(
        "เทรนเนอร์มีตารางสอนทับซ้อนในช่วงเวลานี้",
        409,
      );

    const result = await tx.insert(ptSessions).values({ packageId, ...input });
    return result[0].insertId;
  });
}

/** ปิด session พร้อมบันทึกผลร่างกายและเปลี่ยนแพ็กเกจเป็นเสร็จสิ้นเมื่อใช้ครบ */
export async function completePtSession(
  sessionId: number,
  input: {
    weightKg?: number;
    bmi?: number;
    waistCm?: number;
    workoutSummary?: string;
    trainerNote?: string;
  },
) {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select({
        id: ptSessions.id,
        packageId: ptSessions.packageId,
        scheduledDate: ptSessions.scheduledDate,
      })
      .from(ptSessions)
      .where(and(eq(ptSessions.id, sessionId), eq(ptSessions.status, "SCHEDULED")))
      .limit(1)
      .for("update");
    if (!session)
      throw new PersonalTrainingOperationError("Session นี้บันทึกผลไม่ได้หรือปิดไปแล้ว", 409);
    if (session.scheduledDate > getBangkokToday())
      throw new PersonalTrainingOperationError(
        "ยังไม่สามารถปิด Session ก่อนถึงวันนัดได้",
        409,
      );

    const [ptPackage] = await tx
      .select({ totalSessions: ptPackages.totalSessions })
      .from(ptPackages)
      .where(eq(ptPackages.id, session.packageId))
      .limit(1)
      .for("update");
    if (!ptPackage)
      throw new PersonalTrainingOperationError("ไม่พบ PT Package ของ Session นี้", 409);

    await tx
      .update(ptSessions)
      .set({
        status: "COMPLETED",
        weightKg: input.weightKg === undefined ? null : String(input.weightKg),
        bmi: input.bmi === undefined ? null : String(input.bmi),
        waistCm: input.waistCm === undefined ? null : String(input.waistCm),
        workoutSummary: input.workoutSummary || null,
        trainerNote: input.trainerNote || null,
        completedAt: new Date(),
      })
      .where(eq(ptSessions.id, sessionId));

    const completedSessions = await tx
      .select({ id: ptSessions.id })
      .from(ptSessions)
      .where(
        and(
          eq(ptSessions.packageId, session.packageId),
          eq(ptSessions.status, "COMPLETED"),
        ),
      );
    if (completedSessions.length >= ptPackage.totalSessions)
      await tx
        .update(ptPackages)
        .set({ status: "COMPLETED" })
        .where(eq(ptPackages.id, session.packageId));
  });
}

/** ยกเลิกเฉพาะนัดที่ยังไม่เริ่มเพื่อคืนโควตาการนัดหมายให้แพ็กเกจ */
export async function cancelPtSession(sessionId: number) {
  const result = await db
    .update(ptSessions)
    .set({ status: "CANCELLED", cancelledAt: new Date() })
    .where(and(eq(ptSessions.id, sessionId), eq(ptSessions.status, "SCHEDULED")));
  if (result[0].affectedRows !== 1)
    throw new PersonalTrainingOperationError("Session นี้ยกเลิกไม่ได้หรือถูกยกเลิกแล้ว", 409);
}
