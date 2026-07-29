import { and, desc, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  classBookings,
  fitnessClasses,
  members,
  ptPackages,
  ptSessions,
  trainers,
} from "@/db/schema";

export class ClassOperationError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "ClassOperationError";
  }
}

/** โหลดข้อมูลตารางคลาส รายชื่อผู้เกี่ยวข้อง และประวัติการจองสำหรับแดชบอร์ดในครั้งเดียว */
export async function getClassDashboard() {
  const [classRows, trainerRows, memberRows, bookingRows, historyRows] =
    await Promise.all([
      db
        .select({
          id: fitnessClasses.id,
          trainerId: fitnessClasses.trainerId,
          name: fitnessClasses.name,
          category: fitnessClasses.category,
          room: fitnessClasses.room,
          classDate: fitnessClasses.classDate,
          startTime: fitnessClasses.startTime,
          endTime: fitnessClasses.endTime,
          capacity: fitnessClasses.capacity,
          status: fitnessClasses.status,
          note: fitnessClasses.note,
          trainerCode: trainers.code,
          trainerFirstName: trainers.firstName,
          trainerLastName: trainers.lastName,
        })
        .from(fitnessClasses)
        .innerJoin(trainers, eq(fitnessClasses.trainerId, trainers.id))
        .orderBy(fitnessClasses.classDate, fitnessClasses.startTime),
      db
        .select({
          id: trainers.id,
          code: trainers.code,
          firstName: trainers.firstName,
          lastName: trainers.lastName,
          specialty: trainers.specialty,
          phone: trainers.phone,
        })
        .from(trainers)
        .where(eq(trainers.status, "ACTIVE"))
        .orderBy(trainers.code),
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
        .select({ classId: classBookings.classId })
        .from(classBookings)
        .where(inArray(classBookings.status, ["CONFIRMED", "ATTENDED"])),
      db
        .select({
          id: classBookings.id,
          classId: fitnessClasses.id,
          className: fitnessClasses.name,
          classDate: fitnessClasses.classDate,
          startTime: fitnessClasses.startTime,
          memberCode: members.memberCode,
          firstName: members.firstName,
          lastName: members.lastName,
          status: classBookings.status,
          bookedAt: classBookings.bookedAt,
          cancelledAt: classBookings.cancelledAt,
        })
        .from(classBookings)
        .innerJoin(fitnessClasses, eq(classBookings.classId, fitnessClasses.id))
        .innerJoin(members, eq(classBookings.memberId, members.id))
        .orderBy(desc(classBookings.bookedAt))
        .limit(50),
    ]);

  const bookedByClass = bookingRows.reduce<Record<number, number>>(
    (counts, booking) => {
      counts[booking.classId] = (counts[booking.classId] ?? 0) + 1;
      return counts;
    },
    {},
  );

  return {
    classes: classRows.map((item) => ({
      ...item,
      bookedCount: bookedByClass[item.id] ?? 0,
    })),
    trainers: trainerRows,
    members: memberRows,
    history: historyRows.map((item) => ({
      ...item,
      bookedAt: item.bookedAt?.toISOString() ?? null,
      cancelledAt: item.cancelledAt?.toISOString() ?? null,
    })),
  };
}

/** เพิ่มข้อมูลเทรนเนอร์ใหม่โดยป้องกันรหัสซ้ำก่อนบันทึก */
export async function createTrainer(input: {
  code: string;
  firstName: string;
  lastName: string;
  specialty: string;
  phone?: string;
  note?: string;
}) {
  const [duplicate] = await db
    .select({ id: trainers.id })
    .from(trainers)
    .where(eq(trainers.code, input.code))
    .limit(1);
  if (duplicate)
    throw new ClassOperationError("รหัสเทรนเนอร์นี้ถูกใช้งานแล้ว", 409);

  const result = await db.insert(trainers).values({
    ...input,
    phone: input.phone || null,
    note: input.note || null,
  });
  return result[0].insertId;
}

/** สร้างรอบคลาสหลังตรวจสถานะเทรนเนอร์ ช่วงเวลา และตารางที่ทับซ้อนกัน */
export async function createFitnessClass(input: {
  trainerId: number;
  name: string;
  category: "YOGA" | "ZUMBA" | "SPINNING" | "STRENGTH" | "OTHER";
  room: string;
  classDate: string;
  startTime: string;
  endTime: string;
  capacity: number;
  note?: string;
}) {
  return db.transaction(async (tx) => {
    const [trainer] = await tx
      .select({ id: trainers.id, status: trainers.status })
      .from(trainers)
      .where(eq(trainers.id, input.trainerId))
      .limit(1)
      .for("update");
    if (!trainer || trainer.status !== "ACTIVE")
      throw new ClassOperationError("ไม่พบเทรนเนอร์ที่พร้อมสอน", 400);

    const [overlap] = await tx
      .select({ id: fitnessClasses.id })
      .from(fitnessClasses)
      .where(
        and(
          eq(fitnessClasses.trainerId, input.trainerId),
          eq(fitnessClasses.classDate, input.classDate),
          ne(fitnessClasses.status, "CANCELLED"),
          lt(fitnessClasses.startTime, input.endTime),
          gt(fitnessClasses.endTime, input.startTime),
        ),
      )
      .limit(1);
    const [ptOverlap] = await tx
      .select({ id: ptSessions.id })
      .from(ptSessions)
      .innerJoin(ptPackages, eq(ptSessions.packageId, ptPackages.id))
      .where(
        and(
          eq(ptPackages.trainerId, input.trainerId),
          eq(ptSessions.scheduledDate, input.classDate),
          ne(ptSessions.status, "CANCELLED"),
          lt(ptSessions.startTime, input.endTime),
          gt(ptSessions.endTime, input.startTime),
        ),
      )
      .limit(1);
    if (overlap || ptOverlap)
      throw new ClassOperationError(
        "เทรนเนอร์มีตารางสอนทับซ้อนในช่วงเวลานี้",
        409,
      );

    const result = await tx.insert(fitnessClasses).values({
      ...input,
      note: input.note || null,
    });
    return result[0].insertId;
  });
}

/** จองที่นั่งภายใต้ transaction และล็อกรอบคลาสเพื่อป้องกันจำนวนจองเกินความจุ */
export async function bookClass(classId: number, memberId: number) {
  return db.transaction(async (tx) => {
    const [fitnessClass] = await tx
      .select({
        id: fitnessClasses.id,
        status: fitnessClasses.status,
        capacity: fitnessClasses.capacity,
      })
      .from(fitnessClasses)
      .where(eq(fitnessClasses.id, classId))
      .limit(1)
      .for("update");
    if (!fitnessClass || fitnessClass.status !== "SCHEDULED")
      throw new ClassOperationError("รอบคลาสนี้ไม่เปิดรับจอง", 409);

    const [member] = await tx
      .select({ id: members.id, status: members.status })
      .from(members)
      .where(eq(members.id, memberId))
      .limit(1);
    if (!member || member.status !== "ACTIVE")
      throw new ClassOperationError("สมาชิกไม่อยู่ในสถานะที่จองคลาสได้", 400);

    const activeBookings = await tx
      .select({ id: classBookings.id })
      .from(classBookings)
      .where(
        and(
          eq(classBookings.classId, classId),
          inArray(classBookings.status, ["CONFIRMED", "ATTENDED"]),
        ),
      );
    if (activeBookings.length >= fitnessClass.capacity)
      throw new ClassOperationError("คลาสนี้เต็มแล้ว", 409);

    const [existing] = await tx
      .select({ id: classBookings.id, status: classBookings.status })
      .from(classBookings)
      .where(
        and(
          eq(classBookings.classId, classId),
          eq(classBookings.memberId, memberId),
        ),
      )
      .limit(1);
    if (existing && existing.status !== "CANCELLED")
      throw new ClassOperationError("สมาชิกจองคลาสนี้แล้ว", 409);

    if (existing) {
      await tx
        .update(classBookings)
        .set({ status: "CONFIRMED", bookedAt: new Date(), cancelledAt: null })
        .where(eq(classBookings.id, existing.id));
      return existing.id;
    }

    const result = await tx
      .insert(classBookings)
      .values({ classId, memberId, status: "CONFIRMED" });
    return result[0].insertId;
  });
}

/** ยกเลิกเฉพาะรายการที่ยืนยันแล้วเพื่อคืนที่นั่งให้คลาสอย่างถูกต้อง */
export async function cancelClassBooking(classId: number, bookingId: number) {
  const result = await db
    .update(classBookings)
    .set({ status: "CANCELLED", cancelledAt: new Date() })
    .where(
      and(
        eq(classBookings.id, bookingId),
        eq(classBookings.classId, classId),
        eq(classBookings.status, "CONFIRMED"),
      ),
    );
  if (result[0].affectedRows !== 1)
    throw new ClassOperationError("รายการจองนี้ยกเลิกไม่ได้หรือถูกยกเลิกแล้ว", 409);
}
