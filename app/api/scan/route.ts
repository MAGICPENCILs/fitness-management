import { db } from "@/db";
import { cardPool, memberPackages, members, accessLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const scanSchema = z.object({
  serial: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { serial } = scanSchema.parse(body);

    // 1. หาบัตรจาก serial
    const card = await db
      .select()
      .from(cardPool)
      .where(eq(cardPool.serial, serial))
      .limit(1);

    if (card.length === 0 || card[0].status !== "IN_USE" || !card[0].memberId) {
      await db.insert(accessLogs).values({
        serial,
        result: "REJECTED",
        reason: "ไม่พบบัตรหรือบัตรไม่ได้ใช้งาน",
      });
      return NextResponse.json({
        result: "REJECTED",
        reason: "ไม่พบบัตรหรือบัตรไม่ได้ใช้งาน",
      });
    }

    // 2. หาข้อมูลสมาชิก
    const member = await db
      .select()
      .from(members)
      .where(eq(members.id, card[0].memberId))
      .limit(1);

    if (member.length === 0) {
      return NextResponse.json({ result: "REJECTED", reason: "ไม่พบสมาชิก" });
    }

    const m = member[0];

    // 3. เช็คสถานะสมาชิก
    if (m.status === "SUSPENDED") {
      await db.insert(accessLogs).values({
        memberId: m.id, serial,
        result: "REJECTED", reason: "สมาชิกถูกระงับ",
      });
      return NextResponse.json({ result: "REJECTED", reason: "สมาชิกถูกระงับ" });
    }

    if (m.status === "CANCELLED") {
      await db.insert(accessLogs).values({
        memberId: m.id, serial,
        result: "REJECTED", reason: "สมาชิกถูกยกเลิก",
      });
      return NextResponse.json({ result: "REJECTED", reason: "สมาชิกถูกยกเลิก" });
    }

    // 4. หา package ที่ active อยู่
    const pkg = await db
      .select()
      .from(memberPackages)
      .where(eq(memberPackages.memberId, m.id))
      .limit(1);

    if (pkg.length === 0) {
      await db.insert(accessLogs).values({
        memberId: m.id, serial,
        result: "REJECTED", reason: "ไม่มีแพ็กเกจ",
      });
      return NextResponse.json({ result: "REJECTED", reason: "ไม่มีแพ็กเกจ" });
    }

    const activePkg = pkg[0];
    const today = new Date();
    const expireDate = new Date(activePkg.expireDate);
    const daysLeft = Math.ceil(
      (expireDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    // 5. เช็ควันหมดอายุ
    if (daysLeft < 0) {
      await db.insert(accessLogs).values({
        memberId: m.id, serial,
        result: "REJECTED", reason: "แพ็กเกจหมดอายุ",
      });
      return NextResponse.json({ result: "REJECTED", reason: "แพ็กเกจหมดอายุ" });
    }

    // 6. อนุมัติ — บันทึก log
    await db.insert(accessLogs).values({
      memberId: m.id, serial,
      result: "APPROVED", reason: null,
    });

    // 7. ส่งผลกลับพร้อมข้อมูลสมาชิก
    return NextResponse.json({
      result: "APPROVED",
      member: {
        memberCode: m.memberCode,
        firstName:  m.firstName,
        lastName:   m.lastName,
        photoUrl:   m.photoUrl,
        status:     m.status,
        expireDate: activePkg.expireDate,
        daysLeft,
      },
      warning: daysLeft <= 7 ? `เหลืออีก ${daysLeft} วัน` : null,
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}