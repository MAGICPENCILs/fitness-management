import { db } from "@/db";
import { packages, NewPackage } from "@/db/schema";
import { NextResponse } from "next/server";
import { z } from "zod";

const createPackageSchema = z.object({
  name:         z.string().min(1),
  description:  z.string().optional(),
  type:         z.enum(["DAILY", "MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "CUSTOM"]),
  durationDays: z.number().int().positive(),
  price:        z.number().positive(),
});

// GET /api/packages
export async function GET() {
  try {
    const result = await db.select().from(packages);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to fetch packages" }, { status: 500 });
  }
}

// POST /api/packages
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = createPackageSchema.parse(body);

    const newPackage: NewPackage = {
      ...validated,
      price: String(validated.price),
      isActive: true,
    };

    const result = await db.insert(packages).values(newPackage);
    return NextResponse.json(
      { message: "Package created", id: result[0].insertId },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Failed to create package" }, { status: 500 });
  }
}