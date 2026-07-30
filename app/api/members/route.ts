import { db } from "@/db";
import { members, NewMember } from "@/db/schema";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentBranchId } from "@/lib/branch-service";

// Validation Schema
const createMemberSchema = z.object({
  memberCode:  z.string().min(1),
  firstName:   z.string().min(1),
  lastName:    z.string().min(1),
  idCard:      z.string().length(13).optional(),
  phone:       z.string().optional(),
  email:       z.string().email().optional(),
  birthDate:   z.string().optional(),
  gender:      z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  address:     z.string().optional(),
  note:        z.string().optional(),
});

// GET /api/members
export async function GET() {
  try {
    const result = await db.select().from(members);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    );
  }
}

// POST /api/members
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate ข้อมูลที่รับมาด้วย Zod
    const validated = createMemberSchema.parse(body);
    const homeBranchId = await getCurrentBranchId();

    const newMember: NewMember = {
    ...validated,
    homeBranchId,
    status: "ACTIVE",
    birthDate: validated.birthDate ? new Date(validated.birthDate) : undefined,
    };
        const result = await db.insert(members).values(newMember);

    return NextResponse.json(
      { message: "Member created", id: result[0].insertId },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create member" },
      { status: 500 }
    );
  }
}
