import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes as nodeRandomBytes,
  timingSafeEqual,
} from "node:crypto";
import { spawn } from "node:child_process";
import {
  createReadStream,
  createWriteStream,
} from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { z } from "zod";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const MANIFEST_VERSION = 2;

const manifestSchema = z.object({
  version: z.literal(MANIFEST_VERSION),
  file: z.string().min(1),
  database: z.string().min(1),
  schemaVersion: z.string().min(1),
  createdAt: z.iso.datetime(),
  encryption: z.object({
    algorithm: z.literal(ENCRYPTION_ALGORITHM),
    iv: z.string().min(1),
    authTag: z.string().min(1),
  }),
  checksum: z.object({
    algorithm: z.literal("sha256"),
    value: z.string().regex(/^[a-f0-9]{64}$/),
  }),
});

export type BackupManifest = z.infer<typeof manifestSchema>;

export type MySqlTarget = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export type MySqlCommand = {
  file: string;
  args: string[];
  env: Partial<NodeJS.ProcessEnv>;
};

export type BackupExecutor = {
  dump(target: MySqlTarget): Promise<Readable>;
  restore(target: MySqlTarget, input: Readable): Promise<void>;
};

type CreateBackupInput = {
  databaseUrl: string;
  encryptionKey: string;
  outputDirectory: string;
  schemaVersion: string;
};

type CreateBackupDependencies = {
  executor?: BackupExecutor;
  now?: () => Date;
  randomBytes?: (size: number) => Buffer;
};

type VerifyBackupInput = {
  backupPath: string;
  manifestPath: string;
  encryptionKey: string;
};

type RestoreBackupInput = VerifyBackupInput & {
  databaseUrl: string;
  dryRun?: boolean;
  confirmation?: string;
};

type RestoreBackupDependencies = {
  executor?: BackupExecutor;
  restoreEnabled?: boolean;
};

const SAFE_CHILD_ENVIRONMENT_KEYS = [
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "WINDIR",
  "COMSPEC",
] as const;

/** แยก DATABASE_URL เป็นเป้าหมายแบบมีชื่อฐานข้อมูลชัดเจน เพื่อไม่ให้คำสั่ง backup/restore ใช้ target โดยนัย */
export function parseMySqlTarget(databaseUrl: string): MySqlTarget {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("BACKUP_DATABASE_URL_INVALID");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const port = url.port ? Number(url.port) : 3306;
  if (
    url.protocol !== "mysql:" ||
    !url.hostname ||
    !url.username ||
    !database ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535
  ) {
    throw new Error("BACKUP_DATABASE_URL_INVALID");
  }
  return {
    host: url.hostname,
    port,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}

/** สร้าง child environment เท่าที่ MySQL binary ต้องใช้ และแยกรหัสผ่านออกจาก argument/process list */
export function buildMySqlCommand(
  mode: "dump" | "restore",
  databaseUrl: string,
  environment: Partial<NodeJS.ProcessEnv> = process.env,
): MySqlCommand {
  const target = parseMySqlTarget(databaseUrl);
  const env: Partial<NodeJS.ProcessEnv> = {};
  for (const key of SAFE_CHILD_ENVIRONMENT_KEYS) {
    if (environment[key]) env[key] = environment[key];
  }
  env.MYSQL_PWD = target.password;

  const connectionArgs = [
    `--host=${target.host}`,
    `--port=${target.port}`,
    `--user=${target.user}`,
    "--protocol=TCP",
  ];
  if (mode === "dump") {
    return {
      file: environment.MYSQLDUMP_BINARY || "mysqldump",
      args: [
        ...connectionArgs,
        "--single-transaction",
        "--quick",
        "--routines",
        "--triggers",
        "--events",
        "--hex-blob",
        target.database,
      ],
      env,
    };
  }
  return {
    file: environment.MYSQL_BINARY || "mysql",
    args: [...connectionArgs, "--binary-mode=1", target.database],
    env,
  };
}

/** รอ child process แล้วคืนเฉพาะ error code กลาง เพื่อไม่ส่ง stderr ที่อาจมีข้อมูล connection หรือ SQL หลุดขึ้น log */
async function waitForChild(
  child: ReturnType<typeof spawn>,
  failureCode: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    child.once("error", () => reject(new Error(failureCode)));
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(failureCode));
    });
  });
}

/** เรียก MySQL binaries โดยไม่ผ่าน shell เพื่อป้องกัน shell injection และไม่พิมพ์ command ที่มี credential */
export const mysqlBackupExecutor: BackupExecutor = {
  async dump(target) {
    const command = buildMySqlCommand(
      "dump",
      `mysql://${encodeURIComponent(target.user)}:${encodeURIComponent(target.password)}@${target.host}:${target.port}/${encodeURIComponent(target.database)}`,
    );
    const child = spawn(command.file, command.args, {
      env: command.env as NodeJS.ProcessEnv,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (!child.stdout) throw new Error("MYSQL_DUMP_FAILED");
    const completed = waitForChild(child, "MYSQL_DUMP_FAILED");
    return Readable.from(
      (async function* () {
        for await (const chunk of child.stdout!) yield chunk;
        await completed;
      })(),
    );
  },
  async restore(target, input) {
    const command = buildMySqlCommand(
      "restore",
      `mysql://${encodeURIComponent(target.user)}:${encodeURIComponent(target.password)}@${target.host}:${target.port}/${encodeURIComponent(target.database)}`,
    );
    const child = spawn(command.file, command.args, {
      env: command.env as NodeJS.ProcessEnv,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "ignore", "ignore"],
    });
    if (!child.stdin) throw new Error("MYSQL_RESTORE_FAILED");
    try {
      await Promise.all([
        pipeline(input, child.stdin),
        waitForChild(child, "MYSQL_RESTORE_FAILED"),
      ]);
    } catch {
      throw new Error("MYSQL_RESTORE_FAILED");
    }
  },
};

/** ถอด key จาก base64 และบังคับ 256 บิตพอดี เพื่อไม่ลดความแข็งแรงของ AES-GCM ด้วย key ที่คลุมเครือ */
function decodeEncryptionKey(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    throw new Error("BACKUP_ENCRYPTION_KEY_INVALID");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY_INVALID");
  return key;
}

/** คำนวณ checksum แบบ stream เพื่อรองรับ dump ขนาดใหญ่โดยไม่โหลดทั้งไฟล์เข้า memory */
async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

/** สร้างชื่อไฟล์ UTC ที่เรียงตามเวลา และไม่ใส่ชื่อสาขา/ผู้ใช้ซึ่งอาจเป็นข้อมูลระบุตัวบุคคล */
function backupFileName(now: Date): string {
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .replace(/\.\d{3}Z$/, "");
  return `fitness-backup-${timestamp}.sql.enc`;
}

type AuthenticatedManifestMetadata = Pick<
  BackupManifest,
  "version" | "file" | "database" | "schemaVersion" | "createdAt"
> & {
  encryption: Pick<BackupManifest["encryption"], "algorithm" | "iv">;
};

/** จัดลำดับ metadata ที่ใช้ตัดสินใจ restore ให้คงที่ เพื่อให้ AES-GCM ตรวจพบการแก้ manifest ทุกฟิลด์สำคัญ */
function manifestAdditionalData(
  metadata: AuthenticatedManifestMetadata | BackupManifest,
) {
  return Buffer.from(
    JSON.stringify({
      version: metadata.version,
      file: metadata.file,
      database: metadata.database,
      schemaVersion: metadata.schemaVersion,
      createdAt: metadata.createdAt,
      encryption: {
        algorithm: metadata.encryption.algorithm,
        iv: metadata.encryption.iv,
      },
    }),
    "utf8",
  );
}

/** สร้าง MySQL dump เข้ารหัสพร้อม manifest และลบไฟล์บางส่วนเมื่อขั้นตอนไหนล้มเหลว */
export async function createBackup(
  input: CreateBackupInput,
  dependencies: CreateBackupDependencies = {},
): Promise<{ backupPath: string; manifestPath: string; manifest: BackupManifest }> {
  const target = parseMySqlTarget(input.databaseUrl);
  const key = decodeEncryptionKey(input.encryptionKey);
  if (!input.schemaVersion.trim()) throw new Error("BACKUP_SCHEMA_VERSION_REQUIRED");
  const now = dependencies.now?.() ?? new Date();
  const iv = (dependencies.randomBytes ?? nodeRandomBytes)(12);
  if (iv.length !== 12) throw new Error("BACKUP_IV_INVALID");
  await mkdir(input.outputDirectory, { recursive: true });
  const backupPath = join(input.outputDirectory, backupFileName(now));
  const manifestPath = `${backupPath}.manifest.json`;
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const authenticatedMetadata: AuthenticatedManifestMetadata = {
    version: MANIFEST_VERSION,
    file: basename(backupPath),
    database: target.database,
    schemaVersion: input.schemaVersion.trim(),
    createdAt: now.toISOString(),
    encryption: {
      algorithm: ENCRYPTION_ALGORITHM,
      iv: iv.toString("base64"),
    },
  };
  cipher.setAAD(manifestAdditionalData(authenticatedMetadata));

  try {
    const dump = await (dependencies.executor ?? mysqlBackupExecutor).dump(target);
    await pipeline(
      dump,
      cipher,
      createWriteStream(backupPath, { flags: "wx", mode: 0o600 }),
    );
    const manifest: BackupManifest = {
      ...authenticatedMetadata,
      encryption: {
        ...authenticatedMetadata.encryption,
        authTag: cipher.getAuthTag().toString("base64"),
      },
      checksum: {
        algorithm: "sha256",
        value: await sha256File(backupPath),
      },
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    return { backupPath, manifestPath, manifest };
  } catch (error) {
    await Promise.all([
      rm(backupPath, { force: true }),
      rm(manifestPath, { force: true }),
    ]);
    throw error;
  }
}

/** ตรวจ schema ของ manifest, ชื่อไฟล์, checksum และ GCM auth tag ก่อนอนุญาตให้ใช้ backup */
export async function verifyBackup(
  input: VerifyBackupInput,
): Promise<BackupManifest> {
  const key = decodeEncryptionKey(input.encryptionKey);
  let manifest: BackupManifest;
  try {
    manifest = manifestSchema.parse(
      JSON.parse(await readFile(input.manifestPath, "utf8")),
    );
  } catch {
    throw new Error("BACKUP_MANIFEST_INVALID");
  }
  if (manifest.file !== basename(input.backupPath))
    throw new Error("BACKUP_MANIFEST_FILE_MISMATCH");
  const actualChecksum = Buffer.from(await sha256File(input.backupPath), "hex");
  const expectedChecksum = Buffer.from(manifest.checksum.value, "hex");
  if (
    actualChecksum.length !== expectedChecksum.length ||
    !timingSafeEqual(actualChecksum, expectedChecksum)
  ) {
    throw new Error("BACKUP_CHECKSUM_INVALID");
  }

  const decipher = createDecipheriv(
    ENCRYPTION_ALGORITHM,
    key,
    Buffer.from(manifest.encryption.iv, "base64"),
  );
  decipher.setAAD(manifestAdditionalData(manifest));
  decipher.setAuthTag(Buffer.from(manifest.encryption.authTag, "base64"));
  try {
    await pipeline(
      createReadStream(input.backupPath),
      decipher,
      new Writable({ write: (_chunk, _encoding, callback) => callback() }),
    );
  } catch {
    throw new Error("BACKUP_DECRYPTION_INVALID");
  }
  return manifest;
}

/** ตรวจ backup เสมอ และ restore จริงเฉพาะเมื่อ flag กับข้อความยืนยันชื่อตรงกันทุกตัวอักษร */
export async function restoreBackup(
  input: RestoreBackupInput,
  dependencies: RestoreBackupDependencies = {},
): Promise<BackupManifest & { restored: boolean }> {
  const target = parseMySqlTarget(input.databaseUrl);
  const manifest = await verifyBackup(input);
  if (manifest.database !== target.database)
    throw new Error("BACKUP_DATABASE_MISMATCH");
  if (input.dryRun !== false) return { ...manifest, restored: false };

  const restoreEnabled =
    dependencies.restoreEnabled ??
    process.env.BACKUP_RESTORE_ENABLED === "true";
  if (!restoreEnabled) throw new Error("BACKUP_RESTORE_DISABLED");
  if (input.confirmation !== `RESTORE ${target.database}`)
    throw new Error("BACKUP_RESTORE_CONFIRMATION_REQUIRED");

  const key = decodeEncryptionKey(input.encryptionKey);
  const decipher = createDecipheriv(
    ENCRYPTION_ALGORITHM,
    key,
    Buffer.from(manifest.encryption.iv, "base64"),
  );
  decipher.setAAD(manifestAdditionalData(manifest));
  decipher.setAuthTag(Buffer.from(manifest.encryption.authTag, "base64"));
  const restoreDirectory = await mkdtemp(join(tmpdir(), "fitness-restore-"));
  const plaintextPath = join(restoreDirectory, "backup.sql");
  try {
    // ยืนยัน GCM auth tag ให้เสร็จก่อนส่ง SQL เข้า MySQL เพื่อไม่ให้ restore ข้อมูลบางส่วนจากไฟล์ที่ถูกแก้
    await pipeline(
      createReadStream(input.backupPath),
      decipher,
      createWriteStream(plaintextPath, { flags: "wx", mode: 0o600 }),
    );
    await (dependencies.executor ?? mysqlBackupExecutor).restore(
      target,
      createReadStream(plaintextPath),
    );
    return { ...manifest, restored: true };
  } finally {
    await rm(restoreDirectory, { recursive: true, force: true });
  }
}
