import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { and, eq, isNull } from "drizzle-orm";

import { closeDatabase, db } from "@/db";
import { authSessions, staff } from "@/db/schema";
import { writeAudit } from "@/lib/audit-service";
import { hashPassword, validatePassword } from "@/lib/auth/password";

type BootstrapOwnerEnvironment = {
  [key: string]: string | undefined;
  BOOTSTRAP_OWNER_PASSWORD?: string;
  BOOTSTRAP_OWNER_ROTATE?: string;
};

type BootstrapOwnerCliDependencies = {
  execute: (environment: BootstrapOwnerEnvironment) => Promise<void>;
  close: () => Promise<void>;
  stdout: (message: string) => void;
  stderr: (message: string) => void;
  environment?: BootstrapOwnerEnvironment;
};

/** ตั้งหรือ rotate รหัส OWNER001 เท่านั้น โดย lock เป้าหมายและรวม update, revoke และ system audit ไว้ใน transaction เดียว */
export async function bootstrapOwner(
  environment: BootstrapOwnerEnvironment = process.env,
): Promise<void> {
  const password = environment.BOOTSTRAP_OWNER_PASSWORD;
  if (!password) throw new Error("BOOTSTRAP_OWNER_PASSWORD is required");
  const validation = validatePassword(password);
  if (!validation.valid) throw new Error("BOOTSTRAP_OWNER_PASSWORD fails password policy");

  await db.transaction(async (tx) => {
    const [owner] = await tx
      .select({
        id: staff.id,
        staffCode: staff.staffCode,
        homeBranchId: staff.homeBranchId,
        role: staff.role,
        passwordHash: staff.passwordHash,
      })
      .from(staff)
      .where(eq(staff.staffCode, "OWNER001"))
      .limit(1)
      .for("update");
    if (
      !owner ||
      owner.staffCode !== "OWNER001" ||
      owner.role !== "OWNER"
    )
      throw new Error("OWNER001 is not available for bootstrap");

    const rotated = owner.passwordHash !== null;
    if (rotated && environment.BOOTSTRAP_OWNER_ROTATE !== "true")
      throw new Error("Set BOOTSTRAP_OWNER_ROTATE=true to rotate OWNER001");

    const passwordHash = await hashPassword(password);
    const changedAt = new Date();
    const result = await tx
      .update(staff)
      .set({
        passwordHash,
        passwordChangedAt: changedAt,
        mustChangePassword: false,
      })
      .where(and(eq(staff.id, owner.id), eq(staff.staffCode, "OWNER001")));
    if (result[0].affectedRows === 0)
      throw new Error("OWNER001 update failed");

    if (rotated) {
      await tx
        .update(authSessions)
        .set({ revokedAt: changedAt, revokedReason: "PASSWORD_RESET" })
        .where(
          and(
            eq(authSessions.staffId, owner.id),
            isNull(authSessions.revokedAt),
          ),
        );
    }

    await writeAudit(tx, {
      actorStaffId: null,
      branchId: owner.homeBranchId,
      action: "PASSWORD_RESET",
      entityType: "STAFF",
      entityId: owner.id,
      result: "SUCCESS",
      metadata: { source: "OWNER_BOOTSTRAP", rotated },
    });
  });
}

/** ห่อ CLI ด้วยข้อความคงที่และปิด pool ใน finally เพื่อไม่ให้ error จากฐานข้อมูลพา secret/hash หลุดออก output */
export async function runBootstrapOwnerCli(
  dependencies: BootstrapOwnerCliDependencies = {
    execute: bootstrapOwner,
    close: closeDatabase,
    stdout: console.log,
    stderr: console.error,
  },
): Promise<0 | 1> {
  let exitCode: 0 | 1 = 0;
  try {
    await dependencies.execute(dependencies.environment ?? process.env);
    dependencies.stdout("Owner bootstrap completed.");
  } catch {
    dependencies.stderr("Owner bootstrap failed.");
    exitCode = 1;
  }
  try {
    await dependencies.close();
  } catch {
    dependencies.stderr("Database connection could not be closed.");
    exitCode = 1;
  }
  return exitCode;
}

const scriptPath = process.argv[1];
if (scriptPath && import.meta.url === pathToFileURL(resolve(scriptPath)).href) {
  void runBootstrapOwnerCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
