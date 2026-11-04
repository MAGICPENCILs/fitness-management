import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { staff, staffTotp, staffTotpRecoveryCodes } from "@/db/schema";
import { runAuditedMutation } from "@/lib/audit-service";
import { assertTotpEnrollmentAllowed, decryptTotpSecret, encryptTotpSecret, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, verifyTotp } from "@/lib/totp";
import type { ActorContext } from "@/lib/rbac";

export class TotpOperationError extends Error {
  constructor(public code: string) { super(code); this.name = "TotpOperationError"; }
}

function encryptionKey() {
  const key = process.env.AUTH_TOTP_ENCRYPTION_KEY;
  if (!key) throw new TotpOperationError("TOTP_KEY_NOT_CONFIGURED");
  return key;
}

/** เริ่ม enrollment และแสดง recovery codes ครั้งเดียว โดยต้องปิด factor เดิมด้วยรหัสปัจจุบันก่อน */
export async function startTotpEnrollment(actor: ActorContext) {
  const secret = generateTotpSecret();
  const recoveryCodes = generateRecoveryCodes();
  const encryptedSecret = encryptTotpSecret(secret, encryptionKey());
  const [staffRow] = await db.select({ staffCode: staff.staffCode }).from(staff).where(eq(staff.id, actor.staffId)).limit(1);
  if (!staffRow) throw new TotpOperationError("STAFF_NOT_FOUND");
  await runAuditedMutation(
    { actorStaffId: actor.staffId, branchId: actor.homeBranchId, action: "TOTP_ENROLLMENT_STARTED", entityType: "STAFF", entityId: actor.staffId },
    async (tx) => {
      const [current] = await tx.select({ status: staffTotp.status }).from(staffTotp).where(eq(staffTotp.staffId, actor.staffId)).limit(1).for("update");
      assertTotpEnrollmentAllowed(current?.status);
      await tx.insert(staffTotp).values({ staffId: actor.staffId, encryptedSecret, status: "PENDING", lastUsedStep: null, enabledAt: null }).onDuplicateKeyUpdate({ set: { encryptedSecret, status: "PENDING", lastUsedStep: null, enabledAt: null } });
      await tx.delete(staffTotpRecoveryCodes).where(eq(staffTotpRecoveryCodes.staffId, actor.staffId));
      await tx.insert(staffTotpRecoveryCodes).values(recoveryCodes.map((code) => ({ staffId: actor.staffId, codeHash: hashRecoveryCode(code) })));
    },
  );
  const uri = `otpauth://totp/${encodeURIComponent(`Fitness Pro:${staffRow.staffCode}`)}?secret=${secret}&issuer=${encodeURIComponent("Fitness Pro")}&digits=6&period=30`;
  return { secret, recoveryCodes, qrDataUrl: await QRCode.toDataURL(uri, { width: 280, margin: 1 }) };
}

/** ยืนยัน code แรกและ claim step ใน transaction ก่อนเปิดใช้ 2FA */
export async function confirmTotpEnrollment(actor: ActorContext, code: string) {
  return runAuditedMutation(
    { actorStaffId: actor.staffId, branchId: actor.homeBranchId, action: "TOTP_ENABLED", entityType: "STAFF", entityId: actor.staffId },
    async (tx) => {
      const [row] = await tx.select().from(staffTotp).where(and(eq(staffTotp.staffId, actor.staffId), eq(staffTotp.status, "PENDING"))).limit(1).for("update");
      if (!row) throw new TotpOperationError("TOTP_ENROLLMENT_NOT_FOUND");
      const verified = verifyTotp(decryptTotpSecret(row.encryptedSecret, encryptionKey()), code, Math.floor(Date.now() / 1000), null);
      if (!verified.valid || verified.step === null) throw new TotpOperationError("TOTP_CODE_INVALID");
      await tx.update(staffTotp).set({ status: "ENABLED", lastUsedStep: verified.step, enabledAt: new Date() }).where(eq(staffTotp.staffId, actor.staffId));
    },
  );
}

/** ปิด 2FA หลังยืนยัน code ปัจจุบันหรือ recovery code และทำลาย recovery codes ที่เหลือ */
export async function disableTotp(actor: ActorContext, code: string) {
  return runAuditedMutation(
    { actorStaffId: actor.staffId, branchId: actor.homeBranchId, action: "TOTP_DISABLED", entityType: "STAFF", entityId: actor.staffId },
    async (tx) => {
      const [row] = await tx.select().from(staffTotp).where(and(eq(staffTotp.staffId, actor.staffId), eq(staffTotp.status, "ENABLED"))).limit(1).for("update");
      if (!row) throw new TotpOperationError("TOTP_NOT_ENABLED");
      const verified = /^\d{6}$/.test(code) ? verifyTotp(decryptTotpSecret(row.encryptedSecret, encryptionKey()), code, Math.floor(Date.now() / 1000), row.lastUsedStep) : { valid: false, step: null };
      let recoveryValid = false;
      if (!verified.valid) {
        const result = await tx.update(staffTotpRecoveryCodes).set({ usedAt: new Date() }).where(and(eq(staffTotpRecoveryCodes.staffId, actor.staffId), eq(staffTotpRecoveryCodes.codeHash, hashRecoveryCode(code)), isNull(staffTotpRecoveryCodes.usedAt)));
        recoveryValid = result[0].affectedRows === 1;
      }
      if (!verified.valid && !recoveryValid) throw new TotpOperationError("TOTP_CODE_INVALID");
      await tx.update(staffTotp).set({ status: "DISABLED", lastUsedStep: null }).where(eq(staffTotp.staffId, actor.staffId));
      await tx.delete(staffTotpRecoveryCodes).where(eq(staffTotpRecoveryCodes.staffId, actor.staffId));
    },
  );
}

/** คืนสถานะ 2FA ของบัญชีปัจจุบันโดยไม่คืน secret */
export async function getTotpStatus(staffId: number) {
  const [row] = await db.select({ status: staffTotp.status, enabledAt: staffTotp.enabledAt }).from(staffTotp).where(eq(staffTotp.staffId, staffId)).limit(1);
  return row ?? { status: "DISABLED" as const, enabledAt: null };
}
