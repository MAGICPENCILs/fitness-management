import { db } from "@/db";
import { memberPackages, NewMemberPackage } from "@/db/schema";
import { packages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const createMemberPackageSchema = z.object({
  memberId:  z.number().int().positive(),
  packageId: z.number().int().positive(),
  startDate: z.string(),
  paidAmount: z.number(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = createMemberPackageSchema.parse(body);

    // ดึง package มาคำนวณ expire_date
    const pkg = await db
      .select()
      .from(packages)
      .where(eq(packages.id, validated.packageId))
      .limit(1);

    if (pkg.length === 0) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    // คำนวณ expire_date จาก startDate + durationDays
    const startDate = new Date(validated.startDate);
    const expireDate = new Date(startDate);
    expireDate.setDate(expireDate.getDate() + pkg[0].durationDays);

    const newMemberPackage: NewMemberPackage = {
      memberId:   validated.memberId,
      packageId:  validated.packageId,
      startDate:  startDate,
      expireDate: expireDate,
      paidAmount: validated.paidAmount,
      status:     "ACTIVE",
    };

    const result = await db.insert(memberPackages).values(newMemberPackage);

    return NextResponse.json(
      { message: "Member package created", id: result[0].insertId },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}