import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createBackup } from "@/lib/backup";

type BackupEnvironment = {
  DATABASE_URL?: string;
  BACKUP_ENCRYPTION_KEY?: string;
  BACKUP_DIRECTORY?: string;
  BACKUP_SCHEMA_VERSION?: string;
};

type BackupCliDependencies = {
  execute: (
    input: Parameters<typeof createBackup>[0],
  ) => Promise<{ backupPath: string; manifestPath: string }>;
  readSchemaVersion: () => Promise<string>;
  environment: BackupEnvironment;
  stdout: (message: string) => void;
  stderr: (message: string) => void;
};

/** อ่าน migration tag ล่าสุดจาก Drizzle journal เพื่อผูก backup กับโครงสร้างฐานข้อมูลที่สร้างไฟล์นั้น */
export async function readDrizzleSchemaVersion(
  journalPath = resolve("drizzle/meta/_journal.json"),
): Promise<string> {
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
    entries?: Array<{ tag?: unknown }>;
  };
  const tag = journal.entries?.at(-1)?.tag;
  if (typeof tag !== "string" || !tag.trim())
    throw new Error("BACKUP_SCHEMA_VERSION_REQUIRED");
  return tag;
}

/** สร้าง backup จาก environment โดยพิมพ์เฉพาะชื่อ artifact และซ่อนรายละเอียด error/credential ทุกกรณี */
export async function runBackupDatabaseCli(
  dependencies: BackupCliDependencies = {
    execute: createBackup,
    readSchemaVersion: readDrizzleSchemaVersion,
    environment: process.env as BackupEnvironment,
    stdout: console.log,
    stderr: console.error,
  },
): Promise<0 | 1> {
  try {
    const databaseUrl = dependencies.environment.DATABASE_URL;
    const encryptionKey = dependencies.environment.BACKUP_ENCRYPTION_KEY;
    if (!databaseUrl || !encryptionKey)
      throw new Error("BACKUP_ENVIRONMENT_REQUIRED");
    const schemaVersion =
      dependencies.environment.BACKUP_SCHEMA_VERSION?.trim() ||
      (await dependencies.readSchemaVersion());
    const result = await dependencies.execute({
      databaseUrl,
      encryptionKey,
      outputDirectory:
        dependencies.environment.BACKUP_DIRECTORY || resolve("backups"),
      schemaVersion,
    });
    dependencies.stdout(`Backup completed: ${basename(result.backupPath)}`);
    dependencies.stdout(`Manifest: ${basename(result.manifestPath)}`);
    return 0;
  } catch {
    dependencies.stderr("Database backup failed.");
    return 1;
  }
}

const scriptPath = process.argv[1];
if (scriptPath && import.meta.url === pathToFileURL(resolve(scriptPath)).href) {
  void runBackupDatabaseCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
