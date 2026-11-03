import { Readable } from "node:stream";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildMySqlCommand,
  createBackup,
  restoreBackup,
  verifyBackup,
  type BackupExecutor,
} from "@/lib/backup";

const DATABASE_URL =
  "mysql://fitness_user:super-secret@db.example.test:3307/fitness_test";
const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
const directories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "fitness-backup-test-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("database backup", () => {
  it("ไม่ใส่รหัสผ่านหรือ DATABASE_URL ลง command line ของ MySQL", () => {
    const command = buildMySqlCommand("dump", DATABASE_URL, {
      MYSQLDUMP_BINARY: "custom-mysqldump",
      PATH: "safe-path",
    });

    expect(command.file).toBe("custom-mysqldump");
    expect(command.args).toContain("--host=db.example.test");
    expect(command.args).toContain("--port=3307");
    expect(command.args).toContain("--user=fitness_user");
    expect(command.args.join(" ")).not.toContain("super-secret");
    expect(command.args.join(" ")).not.toContain(DATABASE_URL);
    expect(command.env).toEqual({ PATH: "safe-path", MYSQL_PWD: "super-secret" });
  });

  it("สร้างไฟล์เข้ารหัสและ manifest ที่ตรวจ checksum กับ schema version ได้", async () => {
    const outputDirectory = await temporaryDirectory();
    const executor: BackupExecutor = {
      dump: vi.fn(async () => Readable.from(["CREATE TABLE members (id int);\n"])),
      restore: vi.fn(),
    };

    const result = await createBackup(
      {
        databaseUrl: DATABASE_URL,
        encryptionKey: ENCRYPTION_KEY,
        outputDirectory,
        schemaVersion: "0010_auth_sessions",
      },
      {
        executor,
        now: () => new Date("2026-11-03T03:00:00.000Z"),
        randomBytes: () => Buffer.alloc(12, 3),
      },
    );

    expect(result.backupPath).toMatch(/fitness-backup-20261103-030000\.sql\.enc$/);
    expect(await readFile(result.backupPath, "utf8")).not.toContain("CREATE TABLE");
    await expect(
      verifyBackup({
        backupPath: result.backupPath,
        manifestPath: result.manifestPath,
        encryptionKey: ENCRYPTION_KEY,
      }),
    ).resolves.toMatchObject({
      database: "fitness_test",
      schemaVersion: "0010_auth_sessions",
    });
  });

  it("ปฏิเสธ backup ที่ถูกแก้หลังสร้าง manifest", async () => {
    const outputDirectory = await temporaryDirectory();
    const executor: BackupExecutor = {
      dump: async () => Readable.from(["SELECT 1;\n"]),
      restore: vi.fn(),
    };
    const result = await createBackup(
      {
        databaseUrl: DATABASE_URL,
        encryptionKey: ENCRYPTION_KEY,
        outputDirectory,
        schemaVersion: "0010_auth_sessions",
      },
      { executor, randomBytes: () => Buffer.alloc(12, 4) },
    );
    await writeFile(result.backupPath, "tampered");

    await expect(
      verifyBackup({
        backupPath: result.backupPath,
        manifestPath: result.manifestPath,
        encryptionKey: ENCRYPTION_KEY,
      }),
    ).rejects.toThrow("BACKUP_CHECKSUM_INVALID");
  });

  it("restore เป็น dry-run โดยปริยาย และไม่แตะฐานข้อมูล", async () => {
    const outputDirectory = await temporaryDirectory();
    const restored: string[] = [];
    const executor: BackupExecutor = {
      dump: async () => Readable.from(["SELECT 1;\n"]),
      restore: vi.fn(async (_target, input) => {
        for await (const chunk of input) restored.push(chunk.toString());
      }),
    };
    const backup = await createBackup(
      {
        databaseUrl: DATABASE_URL,
        encryptionKey: ENCRYPTION_KEY,
        outputDirectory,
        schemaVersion: "0010_auth_sessions",
      },
      { executor, randomBytes: () => Buffer.alloc(12, 5) },
    );

    await expect(
      restoreBackup(
        {
          databaseUrl: DATABASE_URL,
          encryptionKey: ENCRYPTION_KEY,
          backupPath: backup.backupPath,
          manifestPath: backup.manifestPath,
          dryRun: true,
        },
        { executor },
      ),
    ).resolves.toMatchObject({ restored: false, database: "fitness_test" });
    expect(executor.restore).not.toHaveBeenCalled();
    expect(restored).toEqual([]);
  });

  it("restore จริงต้องเปิด flag และยืนยันชื่อฐานข้อมูลให้ตรงก่อนถอดรหัส", async () => {
    const outputDirectory = await temporaryDirectory();
    const restored: string[] = [];
    const executor: BackupExecutor = {
      dump: async () => Readable.from(["SELECT 1;\n"]),
      restore: vi.fn(async (_target, input) => {
        for await (const chunk of input) restored.push(chunk.toString());
      }),
    };
    const backup = await createBackup(
      {
        databaseUrl: DATABASE_URL,
        encryptionKey: ENCRYPTION_KEY,
        outputDirectory,
        schemaVersion: "0010_auth_sessions",
      },
      { executor, randomBytes: () => Buffer.alloc(12, 6) },
    );
    const input = {
      databaseUrl: DATABASE_URL,
      encryptionKey: ENCRYPTION_KEY,
      backupPath: backup.backupPath,
      manifestPath: backup.manifestPath,
      dryRun: false,
      confirmation: "RESTORE fitness_test",
    } as const;

    await expect(
      restoreBackup(input, { executor, restoreEnabled: false }),
    ).rejects.toThrow("BACKUP_RESTORE_DISABLED");
    await expect(
      restoreBackup(
        { ...input, confirmation: "RESTORE other_database" },
        { executor, restoreEnabled: true },
      ),
    ).rejects.toThrow("BACKUP_RESTORE_CONFIRMATION_REQUIRED");

    await expect(
      restoreBackup(input, { executor, restoreEnabled: true }),
    ).resolves.toMatchObject({ restored: true, database: "fitness_test" });
    expect(restored.join("")).toBe("SELECT 1;\n");
  });
});
