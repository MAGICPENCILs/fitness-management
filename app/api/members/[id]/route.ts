import { db } from "@/db";
import { members, memberPackages, packages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

// GET /api/members/[id]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // ดึงข้อมูลสมาชิก
    const member = await db
      .select()
      .from(members)
      .where(eq(members.id, Number(id)))
      .limit(1);

    if (member.length === 0) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // ดึง packages ของสมาชิก
    const memberPkgs = await db
      .select({
        id:           memberPackages.id,
        packageId:    memberPackages.packageId,
        packageName:  packages.name,
        startDate:    memberPackages.startDate,
        expireDate:   memberPackages.expireDate,
        status:       memberPackages.status,
        paidAmount:   memberPackages.paidAmount,
      })
      .from(memberPackages)
      .innerJoin(packages, eq(memberPackages.packageId, packages.id))
      .where(eq(memberPackages.memberId, Number(id)));

    return NextResponse.json({
      ...member[0],
      packages: memberPkgs,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch member" }, { status: 500 });
  }
}

// PATCH /api/members/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    await db
      .update(members)
      .set({
        firstName:  body.firstName,
        lastName:   body.lastName,
        phone:      body.phone,
        email:      body.email,
        address:    body.address,
        note:       body.note,
        gender:     body.gender,
        birthDate:  body.birthDate ? new Date(body.birthDate) : undefined,
        photoUrl:   body.photoUrl,
      })
      .where(eq(members.id, Number(id)));

    return NextResponse.json({ message: "Updated" });
  } catch {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}