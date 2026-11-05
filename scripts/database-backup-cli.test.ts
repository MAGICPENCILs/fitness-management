import { describe, expect, it, vi } from "vitest";

import { runBackupDatabaseCli } from "@/scripts/backup-database";
import { runRestoreDatabaseCli } from "@/scripts/restore-database";

const environment = {
  DATABASE_URL: "mysql://user:database-password@localhost:3306/fitness_test",
  BACKUP_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
  BACKUP_DIRECTORY: "D:/safe-backups",
};

describe("database backup CLI", () => {
  it("ส่ง target ที่กำหนดให้ createBackup และพิมพ์เฉพาะชื่อไฟล์", async () => {
    const stdout = vi.fn();
    const execute = vi.fn(async () => ({
      backupPath: "D:/safe-backups/fitness-backup.sql.enc",
      manifestPath: "D:/safe-backups/fitness-backup.sql.enc.manifest.json",
    }));

    await expect(
      runBackupDatabaseCli({
        execute,
        readSchemaVersion: async () => "0010_auth_sessions",
        environment,
        stdout,
        stderr: vi.fn(),
      }),
    ).resolves.toBe(0);

    expect(execute).toHaveBeenCalledWith({
      databaseUrl: environment.DATABASE_URL,
      encryptionKey: environment.BACKUP_ENCRYPTION_KEY,
      outputDirectory: environment.BACKUP_DIRECTORY,
      schemaVersion: "0010_auth_sessions",
    });
    expect(JSON.stringify(stdout.mock.calls)).not.toContain("database-password");
    expect(stdout).toHaveBeenCalledWith(
      "Backup completed: fitness-backup.sql.enc",
    );
  });

  it("ไม่เผย secret หรือรายละเอียด dependency error", async () => {
    const stderr = vi.fn();
    const execute = vi.fn(async () => {
      throw new Error(
        `${environment.DATABASE_URL}:${environment.BACKUP_ENCRYPTION_KEY}`,
      );
    });

    await expect(
      runBackupDatabaseCli({
        execute,
        readSchemaVersion: async () => "0010_auth_sessions",
        environment,
        stdout: vi.fn(),
        stderr,
      }),
    ).resolves.toBe(1);
    expect(stderr).toHaveBeenCalledWith("Database backup failed.");
    expect(JSON.stringify(stderr.mock.calls)).not.toContain("database-password");
    expect(JSON.stringify(stderr.mock.calls)).not.toContain(
      environment.BACKUP_ENCRYPTION_KEY,
    );
  });
});

describe("database restore CLI", () => {
  it("เป็น dry-run โดยปริยาย และ execute เฉพาะเมื่อระบุ flag", async () => {
    const execute = vi.fn(async () => ({
      restored: false,
      database: "fitness_test",
    }));
    const dependencies = {
      execute,
      environment,
      stdout: vi.fn(),
      stderr: vi.fn(),
    };

    await expect(
      runRestoreDatabaseCli(dependencies, [
        "--backup",
        "D:/safe-backups/fitness.sql.enc",
        "--manifest",
        "D:/safe-backups/fitness.sql.enc.manifest.json",
      ]),
    ).resolves.toBe(0);
    expect(execute).toHaveBeenLastCalledWith(
      expect.objectContaining({ dryRun: true, confirmation: undefined }),
    );

    await runRestoreDatabaseCli(dependencies, [
      "--backup",
      "D:/safe-backups/fitness.sql.enc",
      "--manifest",
      "D:/safe-backups/fitness.sql.enc.manifest.json",
      "--execute",
      "--confirm",
      "RESTORE fitness_test",
    ]);
    expect(execute).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dryRun: false,
        confirmation: "RESTORE fitness_test",
      }),
    );
  });

  it("ปฏิเสธ argument ไม่ครบด้วยข้อความกลาง", async () => {
    const stderr = vi.fn();
    const execute = vi.fn();

    await expect(
      runRestoreDatabaseCli(
        {
          execute,
          environment,
          stdout: vi.fn(),
          stderr,
        },
        ["--execute"],
      ),
    ).resolves.toBe(1);
    expect(execute).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith("Database restore failed.");
  });
});
