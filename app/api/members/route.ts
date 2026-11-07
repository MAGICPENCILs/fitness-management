import { db } from "@/db";
import { consentEvents, members, NewMember } from "@/db/schema";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";
import { canCreateMember } from "@/lib/consent-policy";

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
  // รูปต้องมาจาก upload mutation เท่านั้น เพื่อไม่ให้ผูก URL ของสมาชิกคนอื่นหรือไฟล์ภายนอก
  photoUrl:    z.never().optional(),
  consents: z.object({
    servicePrivacy: z.literal(true, "ต้องยอมรับนโยบายเพื่อให้บริการ"),
    marketing: z.boolean().default(false),
    photo: z.boolean().default(false),
    policyVersion: z.string().trim().min(1).max(30),
  }),
});

// GET /api/members
export async function GET() {
  try {
    const branchId = await getCurrentBranchId();
    await requirePermission("members.manage", branchId);
    const result = await db
      .select()
      .from(members)
      .where(eq(members.homeBranchId, branchId));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    );
  }
}

/** สร้างสมาชิกพร้อม consent โดยไม่รับ photoUrl; รูปต้องผ่าน upload boundary ภายหลัง */
export async function POST(request: Request) {
  try {
    const homeBranchId = await getCurrentBranchId();
    const actor = await requirePermission("members.manage", homeBranchId, {
      action: "MEMBER_CREATED",
      entityType: "MEMBER",
    });
    const body = await request.json();

    // Validate ข้อมูลที่รับมาด้วย Zod
    const validated = createMemberSchema.parse(body);
    if (!canCreateMember({
      SERVICE_PRIVACY: validated.consents.servicePrivacy,
      MARKETING: validated.consents.marketing,
      PHOTO: validated.consents.photo,
    }))
      return NextResponse.json(
        { error: "ต้องยอมรับนโยบายเพื่อให้บริการก่อนสมัครสมาชิก" },
        { status: 400 },
      );
    const newMember: NewMember = {
      memberCode: validated.memberCode,
      firstName: validated.firstName,
      lastName: validated.lastName,
      idCard: validated.idCard,
      phone: validated.phone,
      email: validated.email,
      birthDate: validated.birthDate ? new Date(validated.birthDate) : undefined,
      gender: validated.gender,
      address: validated.address,
      note: validated.note,
      homeBranchId,
      status: "ACTIVE",
    };
    const id = await runAuditedMutation<number>(
      { actorStaffId: actor.staffId, branchId: homeBranchId, action: "MEMBER_CREATED", entityType: "MEMBER", success: (entityId) => ({ entityId }) },
      async (tx) => {
        const result = await tx.insert(members).values(newMember);
        const memberId = result[0].insertId;
        await tx.insert(consentEvents).values([
          {
            memberId,
            branchId: homeBranchId,
            recordedByStaffId: actor.staffId,
            consentType: "SERVICE_PRIVACY",
            action: "GRANTED",
            policyVersion: validated.consents.policyVersion,
            source: "FRONT_DESK",
          },
          {
            memberId,
            branchId: homeBranchId,
            recordedByStaffId: actor.staffId,
            consentType: "MARKETING",
            action: validated.consents.marketing ? "GRANTED" : "WITHDRAWN",
            policyVersion: validated.consents.policyVersion,
            source: "FRONT_DESK",
          },
          {
            memberId,
            branchId: homeBranchId,
            recordedByStaffId: actor.staffId,
            consentType: "PHOTO",
            action: validated.consents.photo ? "GRANTED" : "WITHDRAWN",
            policyVersion: validated.consents.policyVersion,
            source: "FRONT_DESK",
          },
        ]);
        return memberId;
      },
    );

    return NextResponse.json(
      { message: "Member created", id },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json(
      { error: "Failed to create member" },
      { status: 500 }
    );
  }
}
