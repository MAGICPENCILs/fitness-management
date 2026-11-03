import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { restoreBackup } from "@/lib/backup";

type RestoreEnvironment = {
  DATABASE_URL?: string;
  BACKUP_ENCRYPTION_KEY?: string;
};

type RestoreCliDependencies = {
  execute: (
    input: Parameters<typeof restoreBackup>[0],
  ) => Promise<{ restored: boolean; database: string }>;
  environment: RestoreEnvironment;
  stdout: (message: string) => void;
  stderr: (message: string) => void;
};

type RestoreArguments = {
  backupPath: string;
  manifestPath: string;
  execute: boolean;
  confirmation?: string;
};

/** แยกเฉพาะ argument ที่อนุญาต เพื่อไม่ให้ path/ข้อความยืนยันถูกตีความเป็น shell command */
function parseRestoreArguments(args: string[]): RestoreArguments {
  let backupPath = "";
  let manifestPath = "";
  let execute = false;
  let confirmation: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--execute") {
      execute = true;
      continue;
    }
    if (argument === "--backup" || argument === "--manifest" || argument === "--confirm") {
      const value = args[index + 1];
      if (!value) throw new Error("BACKUP_RESTORE_ARGUMENT_INVALID");
      if (argument === "--backup") backupPath = value;
      if (argument === "--manifest") manifestPath = value;
      if (argument === "--confirm") confirmation = value;
      index += 1;
      continue;
    }
    throw new Error("BACKUP_RESTORE_ARGUMENT_INVALID");
  }
  if (!backupPath || !manifestPath)
    throw new Error("BACKUP_RESTORE_ARGUMENT_INVALID");
  return { backupPath, manifestPath, execute, confirmation };
}

/** ตรวจ backup เป็นค่าเริ่มต้น และ restore จริงเฉพาะเมื่อผู้ปฏิบัติงานระบุ --execute พร้อม guard ใน service */
export async function runRestoreDatabaseCli(
  dependencies: RestoreCliDependencies = {
    execute: restoreBackup,
    environment: process.env as RestoreEnvironment,
    stdout: console.log,
    stderr: console.error,
  },
  args: string[] = process.argv.slice(2),
): Promise<0 | 1> {
  try {
    const databaseUrl = dependencies.environment.DATABASE_URL;
    const encryptionKey = dependencies.environment.BACKUP_ENCRYPTION_KEY;
    if (!databaseUrl || !encryptionKey)
      throw new Error("BACKUP_ENVIRONMENT_REQUIRED");
    const parsed = parseRestoreArguments(args);
    const result = await dependencies.execute({
      databaseUrl,
      encryptionKey,
      backupPath: parsed.backupPath,
      manifestPath: parsed.manifestPath,
      dryRun: !parsed.execute,
      confirmation: parsed.confirmation,
    });
    dependencies.stdout(
      result.restored
        ? `Database restore completed: ${result.database}`
        : `Backup verification completed: ${result.database}`,
    );
    return 0;
  } catch {
    dependencies.stderr("Database restore failed.");
    return 1;
  }
}

const scriptPath = process.argv[1];
if (scriptPath && import.meta.url === pathToFileURL(resolve(scriptPath)).href) {
  void runRestoreDatabaseCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
