import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { branchReceiptSettings, branches, receipts } from "@/db/schema";
import { runAuditedMutation } from "@/lib/audit-service";
import type { ActorContext } from "@/lib/rbac";
import type { z } from "zod";
import { receiptSettingsInputSchema } from "@/lib/receipt-service";

export type ReceiptSettingsInput = z.infer<typeof receiptSettingsInputSchema>;

/** โหลดข้อมูลนิติบุคคลของสาขาเพื่อสร้าง snapshot โดยคืน null เมื่อยังไม่ได้ตั้งค่า */
export async function getReceiptSettings(branchId: number) {
  const [row] = await db
    .select()
    .from(branchReceiptSettings)
    .where(eq(branchReceiptSettings.branchId, branchId))
    .limit(1);
  return row ?? null;
}

/** โหลดชื่อสาขาและค่าปัจจุบันสำหรับหน้าตั้งค่าโดยไม่รวมข้อมูลสมาชิก */
export async function getReceiptSettingsDashboard(branchId: number) {
  const [branch] = await db
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(eq(branches.id, branchId))
    .limit(1);
  return { branch, settings: await getReceiptSettings(branchId) };
}

/** บันทึกค่าผู้ออกเอกสารแบบ upsert พร้อม audit เพื่อให้ตรวจย้อนหลังได้ว่าใครเปลี่ยนค่า */
export async function saveReceiptSettings(
  actor: ActorContext,
  branchId: number,
  input: ReceiptSettingsInput,
) {
  return runAuditedMutation<void>(
    {
      actorStaffId: actor.staffId,
      branchId,
      action: "RECEIPT_SETTINGS_UPDATED",
      entityType: "BRANCH_RECEIPT_SETTINGS",
      entityId: branchId,
    },
    async (tx) => {
      await tx
        .insert(branchReceiptSettings)
        .values({
          branchId,
          ...input,
          taxId: input.taxId || null,
          phone: input.phone || null,
        })
        .onDuplicateKeyUpdate({
          set: {
            ...input,
            taxId: input.taxId || null,
            phone: input.phone || null,
          },
        });
    },
  );
}

/** โหลดเอกสารเฉพาะสาขาปัจจุบันเพื่อกันการเดา id ข้ามสาขา */
export async function getReceiptForPrint(branchId: number, receiptId: number) {
  const [row] = await db
    .select()
    .from(receipts)
    .where(and(eq(receipts.id, receiptId), eq(receipts.branchId, branchId)))
    .limit(1);
  return row ?? null;
}
