import { Readable } from "node:stream";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
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
    expect(command.args).not.toContain("--databases");
    expect(command.args.at(-1)).toBe("fitness_test");
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

  it("ปฏิเสธ manifest เมื่อ metadata ที่กำหนดเป้าหมาย restore ถูกแก้", async () => {
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
      { executor, randomBytes: () => Buffer.alloc(12, 8) },
    );
    const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
    manifest.database = "attacker_database";
    await writeFile(result.manifestPath, JSON.stringify(manifest));

    await expect(
      verifyBackup({
        backupPath: result.backupPath,
        manifestPath: result.manifestPath,
        encryptionKey: ENCRYPTION_KEY,
      }),
    ).rejects.toThrow("BACKUP_DECRYPTION_INVALID");
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

  it("ยืนยันไฟล์ plaintext ให้ครบก่อนส่งเข้า MySQL และลบไฟล์ชั่วคราวหลังสำเร็จ", async () => {
    const outputDirectory = await temporaryDirectory();
    let plaintextPath: string | undefined;
    let plaintextMode: number | undefined;
    const executor: BackupExecutor = {
      dump: async () => Readable.from(["SELECT 1;\n"]),
      restore: vi.fn(async (_target, input) => {
        plaintextPath = typeof input.path === "string" ? input.path : undefined;
        if (plaintextPath) plaintextMode = (await stat(plaintextPath)).mode & 0o777;
        for await (const chunk of input) {
          void chunk;
          // อ่าน stream ให้จบเหมือน MySQL เพื่อยืนยันว่าไฟล์พร้อมใช้ก่อน restore
        }
      }),
    };
    const backup = await createBackup(
      {
        databaseUrl: DATABASE_URL,
        encryptionKey: ENCRYPTION_KEY,
        outputDirectory,
        schemaVersion: "0010_auth_sessions",
      },
      { executor, randomBytes: () => Buffer.alloc(12, 9) },
    );

    await restoreBackup(
      {
        databaseUrl: DATABASE_URL,
        encryptionKey: ENCRYPTION_KEY,
        backupPath: backup.backupPath,
        manifestPath: backup.manifestPath,
        dryRun: false,
        confirmation: "RESTORE fitness_test",
      },
      { executor, restoreEnabled: true },
    );

    expect(plaintextPath).toBeTypeOf("string");
    // Windows ใช้ ACL และไม่สะท้อน POSIX mode จาก createWriteStream ใน stat
    if (process.platform !== "win32") expect(plaintextMode).toBe(0o600);
    await expect(stat(plaintextPath!)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("ลบไฟล์ plaintext ชั่วคราวแม้ MySQL restore ล้มเหลว", async () => {
    const outputDirectory = await temporaryDirectory();
    let plaintextPath: string | undefined;
    const executor: BackupExecutor = {
      dump: async () => Readable.from(["SELECT 1;\n"]),
      restore: vi.fn(async (_target, input) => {
        plaintextPath = typeof input.path === "string" ? input.path : undefined;
        throw new Error("MYSQL_RESTORE_FAILED");
      }),
    };
    const backup = await createBackup(
      {
        databaseUrl: DATABASE_URL,
        encryptionKey: ENCRYPTION_KEY,
        outputDirectory,
        schemaVersion: "0010_auth_sessions",
      },
      { executor, randomBytes: () => Buffer.alloc(12, 10) },
    );

    await expect(
      restoreBackup(
        {
          databaseUrl: DATABASE_URL,
          encryptionKey: ENCRYPTION_KEY,
          backupPath: backup.backupPath,
          manifestPath: backup.manifestPath,
          dryRun: false,
          confirmation: "RESTORE fitness_test",
        },
        { executor, restoreEnabled: true },
      ),
    ).rejects.toThrow("MYSQL_RESTORE_FAILED");

    expect(plaintextPath).toBeTypeOf("string");
    await expect(stat(plaintextPath!)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
