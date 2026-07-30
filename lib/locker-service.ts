import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { lockerRentals, lockers, members } from "@/db/schema";

export class LockerOperationError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "LockerOperationError";
  }
}

/** โหลดสถานะปัจจุบันและประวัติล่าสุดใน query ชุดเดียวสำหรับหน้าเคาน์เตอร์ */
export async function getLockerDashboard(branchId: number) {
  const [lockerRows, memberRows, historyRows] = await Promise.all([
    db
      .select({
        id: lockers.id,
        code: lockers.code,
        zone: lockers.zone,
        status: lockers.status,
        monthlyRate: lockers.monthlyRate,
        note: lockers.note,
        rentalId: lockerRentals.id,
        rentalType: lockerRentals.rentalType,
        startDate: lockerRentals.startDate,
        endDate: lockerRentals.endDate,
        rentalPrice: lockerRentals.price,
        memberId: members.id,
        memberCode: members.memberCode,
        firstName: members.firstName,
        lastName: members.lastName,
      })
      .from(lockers)
      .leftJoin(
        lockerRentals,
        and(
          eq(lockerRentals.lockerId, lockers.id),
          eq(lockerRentals.status, "ACTIVE"),
        ),
      )
      .leftJoin(members, eq(lockerRentals.memberId, members.id))
      .where(eq(lockers.branchId, branchId))
      .orderBy(lockers.zone, lockers.code),
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
        id: lockerRentals.id,
        lockerCode: lockers.code,
        memberCode: members.memberCode,
        firstName: members.firstName,
        lastName: members.lastName,
        rentalType: lockerRentals.rentalType,
        startDate: lockerRentals.startDate,
        endDate: lockerRentals.endDate,
        price: lockerRentals.price,
        status: lockerRentals.status,
        checkedOutAt: lockerRentals.checkedOutAt,
        createdAt: lockerRentals.createdAt,
      })
      .from(lockerRentals)
      .innerJoin(lockers, eq(lockerRentals.lockerId, lockers.id))
      .innerJoin(members, eq(lockerRentals.memberId, members.id))
      .where(eq(lockers.branchId, branchId))
      .orderBy(desc(lockerRentals.createdAt))
      .limit(30),
  ]);

  return {
    lockers: lockerRows.map((item) => ({
      ...item,
      monthlyRate: item.monthlyRate ? Number(item.monthlyRate) : null,
      rentalPrice: item.rentalPrice ? Number(item.rentalPrice) : null,
    })),
    members: memberRows,
    history: historyRows.map((item) => ({
      ...item,
      price: Number(item.price),
      checkedOutAt: item.checkedOutAt?.toISOString() ?? null,
      createdAt: item.createdAt?.toISOString() ?? null,
    })),
  };
}

/** มอบล็อกเกอร์ด้วย conditional update เพื่อกันคำขอพร้อมกันใช้ตู้เดียวกัน */
export async function rentLocker(input: {
  lockerId: number;
  memberId: number;
  rentalType: "USAGE" | "MONTHLY";
  startDate: string;
  endDate?: string;
  price: number;
  note?: string;
}) {
  const [member] = await db
    .select({ id: members.id, status: members.status })
    .from(members)
    .where(eq(members.id, input.memberId))
    .limit(1);
  if (!member || member.status !== "ACTIVE")
    throw new LockerOperationError(
      "สมาชิกไม่อยู่ในสถานะที่ใช้ล็อกเกอร์ได้",
      400,
    );

  return db.transaction(async (tx) => {
    const updateResult = await tx
      .update(lockers)
      .set({ status: "OCCUPIED" })
      .where(
        and(eq(lockers.id, input.lockerId), eq(lockers.status, "AVAILABLE")),
      );
    if (updateResult[0].affectedRows !== 1)
      throw new LockerOperationError(
        "ล็อกเกอร์ไม่ว่างหรือไม่มีอยู่ในระบบ",
        409,
      );

    const result = await tx.insert(lockerRentals).values({
      lockerId: input.lockerId,
      memberId: input.memberId,
      rentalType: input.rentalType,
      startDate: input.startDate,
      endDate: input.endDate || null,
      price: String(input.price),
      status: "ACTIVE",
      note: input.note || null,
    });
    return result[0].insertId;
  });
}

/** ปิดประวัติการใช้งานก่อนคืนตู้เป็นว่าง เพื่อให้สองสถานะเปลี่ยนพร้อมกันใน transaction */
export async function releaseLocker(lockerId: number) {
  return db.transaction(async (tx) => {
    const rentalResult = await tx
      .update(lockerRentals)
      .set({ status: "COMPLETED", checkedOutAt: new Date() })
      .where(
        and(
          eq(lockerRentals.lockerId, lockerId),
          eq(lockerRentals.status, "ACTIVE"),
        ),
      );
    if (rentalResult[0].affectedRows !== 1)
      throw new LockerOperationError("ไม่พบการใช้งานที่กำลังดำเนินอยู่", 409);

    await tx
      .update(lockers)
      .set({ status: "AVAILABLE" })
      .where(eq(lockers.id, lockerId));
  });
}
