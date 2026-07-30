import { NextResponse } from "next/server";
import { z } from "zod";
import { notificationSettings } from "@/db/schema";
import { getNotificationSettings, parseReminderDays } from "@/lib/notification-engine";
import { getCurrentBranchId } from "@/lib/branch-service";
import { runAuditedMutation } from "@/lib/audit-service";
import { AuthorizationError, requirePermission } from "@/lib/staff-service";

const settingsSchema = z.object({
  reminderDays: z.string().trim().min(1).max(50),
  inactivityDays: z.number().int().min(1).max(365),
  enableInApp: z.boolean(),
  enableSms: z.boolean(),
  enableLine: z.boolean(),
  enableEmail: z.boolean(),
  isActive: z.boolean(),
});

/** โหลดค่าตั้งระบบแจ้งเตือนล่าสุดสำหรับหน้า Admin */
export async function GET() {
  return NextResponse.json(await getNotificationSettings());
}

/** ตรวจสอบและบันทึกค่าตั้งระบบแจ้งเตือนแบบ singleton ที่แถวหมายเลข 1 */
export async function PATCH(request: Request) {
  try {
    const branchId = await getCurrentBranchId();
    const actor = await requirePermission("settings.manage", branchId, {
      action: "NOTIFICATION_SETTINGS_UPDATED",
      entityType: "NOTIFICATION_SETTINGS",
    });
    const validated = settingsSchema.parse(await request.json());
    const reminderDays = parseReminderDays(validated.reminderDays);
    if (!reminderDays.length) {
      return NextResponse.json({ error: "กรุณาระบุจำนวนวันแจ้งเตือนอย่างน้อย 1 ค่า" }, { status: 400 });
    }
    if (!validated.enableInApp && !validated.enableSms && !validated.enableLine && !validated.enableEmail) {
      return NextResponse.json({ error: "กรุณาเปิดช่องทางแจ้งเตือนอย่างน้อย 1 ช่องทาง" }, { status: 400 });
    }

    const values = {
      reminderDays: reminderDays.join(","),
      inactivityDays: validated.inactivityDays,
      enableInApp: validated.enableInApp,
      enableSms: validated.enableSms,
      enableLine: validated.enableLine,
      enableEmail: validated.enableEmail,
      isActive: validated.isActive,
    };
    await runAuditedMutation(
      { actorStaffId: actor.staffId, branchId, action: "NOTIFICATION_SETTINGS_UPDATED", entityType: "NOTIFICATION_SETTINGS", entityId: 1, metadata: { status: values.isActive ? "ACTIVE" : "INACTIVE" } },
      (tx) => tx.insert(notificationSettings).values({ id: 1, ...values }).onDuplicateKeyUpdate({ set: values }),
    );
    return NextResponse.json({ message: "บันทึกการตั้งค่าแล้ว", settings: { id: 1, ...values } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "ข้อมูลการตั้งค่าไม่ถูกต้อง", details: error.issues }, { status: 400 });
    }
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "ไม่สามารถบันทึกการตั้งค่าได้" }, { status: 500 });
  }
}
