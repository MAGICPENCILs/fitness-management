import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  type Owner = {
    id: number;
    staffCode: string;
    homeBranchId: number;
    role: "OWNER" | "MANAGER";
    passwordHash: string | null;
    mustChangePassword: boolean;
  };
  type State = {
    owner: Owner | null;
    revocations: string[];
    audits: Array<Record<string, unknown>>;
  };
  const state: State = { owner: null, revocations: [], audits: [] };
  let affectedRows = 1;
  let failAudit = false;

  const clone = (): State => ({
    owner: state.owner ? { ...state.owner } : null,
    revocations: [...state.revocations],
    audits: state.audits.map((audit) => ({ ...audit })),
  });

  const createExecutor = (working: State) => ({
    select: vi.fn(() => {
      const chain = {
        from: vi.fn(),
        where: vi.fn(),
        limit: vi.fn(),
        for: vi.fn(async () => (working.owner ? [{ ...working.owner }] : [])),
      };
      chain.from.mockReturnValue(chain);
      chain.where.mockReturnValue(chain);
      chain.limit.mockReturnValue(chain);
      return chain;
    }),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          if (affectedRows === 0) return [{ affectedRows: 0 }];
          if ("revokedReason" in values) {
            working.revocations.push(String(values.revokedReason));
          } else if (working.owner) {
            working.owner = { ...working.owner, ...values } as Owner;
          }
          return [{ affectedRows: 1 }];
        }),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        if (failAudit) throw new Error("AUDIT_WRITE_FAILED");
        working.audits.push({ ...values });
      }),
    })),
  });

  const db = {
    transaction: vi.fn(async <T>(callback: (tx: ReturnType<typeof createExecutor>) => Promise<T>) => {
      const working = clone();
      const result = await callback(createExecutor(working));
      state.owner = working.owner;
      state.revocations = working.revocations;
      state.audits = working.audits;
      return result;
    }),
  };
  const closeDatabase = vi.fn(async () => undefined);

  return {
    db,
    closeDatabase,
    state,
    reset(owner?: Partial<Owner> | null) {
      state.owner = owner === null
        ? null
        : {
            id: 1,
            staffCode: "OWNER001",
            homeBranchId: 1,
            role: "OWNER",
            passwordHash: null,
            mustChangePassword: true,
            ...owner,
          };
      state.revocations = [];
      state.audits = [];
      affectedRows = 1;
      failAudit = false;
    },
    setAffectedRows(value: number) {
      affectedRows = value;
    },
    setFailAudit(value: boolean) {
      failAudit = value;
    },
  };
});

vi.mock("@/db", () => ({
  db: database.db,
  closeDatabase: database.closeDatabase,
}));
vi.mock("@/lib/auth/password", { spy: true });

import { hashPassword } from "@/lib/auth/password";
import { bootstrapOwner, runBootstrapOwnerCli } from "@/scripts/bootstrap-owner";

const password = "OwnerSecure#2026";
const hashSentinel = "$argon2id$hash-sentinel";

describe("Owner bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.reset();
    vi.mocked(hashPassword).mockResolvedValue(hashSentinel);
  });

  it("ปฏิเสธ env ที่ไม่มีหรือรหัสผ่านไม่ผ่าน policy ก่อนเปิด transaction", async () => {
    await expect(bootstrapOwner({})).rejects.toThrow(
      "BOOTSTRAP_OWNER_PASSWORD is required",
    );
    await expect(
      bootstrapOwner({ BOOTSTRAP_OWNER_PASSWORD: "weak" }),
    ).rejects.toThrow("password policy");
    expect(database.db.transaction).not.toHaveBeenCalled();
  });

  it("ปฏิเสธ OWNER001 ที่ไม่มีหรือไม่ใช่ Owner", async () => {
    database.reset(null);
    await expect(
      bootstrapOwner({ BOOTSTRAP_OWNER_PASSWORD: password }),
    ).rejects.toThrow("OWNER001 is not available");

    database.reset({ role: "MANAGER" });
    await expect(
      bootstrapOwner({ BOOTSTRAP_OWNER_PASSWORD: password }),
    ).rejects.toThrow("OWNER001 is not available");
  });

  it.each(["owner001", "Owner001"])(
    "ปฏิเสธ staff code %s ที่ collation อาจ match โดยไม่ hash หรือเขียนข้อมูล",
    async (staffCode) => {
      database.reset({ staffCode });

      await expect(
        bootstrapOwner({ BOOTSTRAP_OWNER_PASSWORD: password }),
      ).rejects.toThrow("OWNER001 is not available");
      expect(hashPassword).not.toHaveBeenCalled();
      expect(database.state.owner?.passwordHash).toBeNull();
      expect(database.state.revocations).toEqual([]);
      expect(database.state.audits).toEqual([]);
    },
  );

  it("ไม่เขียนทับ hash เดิมหากไม่ได้ยืนยัน rotate=true", async () => {
    database.reset({ passwordHash: "existing-hash" });

    await expect(
      bootstrapOwner({ BOOTSTRAP_OWNER_PASSWORD: password }),
    ).rejects.toThrow("BOOTSTRAP_OWNER_ROTATE=true");
    expect(database.state.owner?.passwordHash).toBe("existing-hash");
    expect(database.state.revocations).toEqual([]);
    expect(database.state.audits).toEqual([]);
  });

  it("ตั้ง hash ถาวรและเขียน null-actor audit โดยไม่ revoke เมื่อ bootstrap ครั้งแรก", async () => {
    await bootstrapOwner({ BOOTSTRAP_OWNER_PASSWORD: password });

    expect(hashPassword).toHaveBeenCalledWith(password);
    expect(database.state.owner).toMatchObject({
      passwordHash: hashSentinel,
      mustChangePassword: false,
    });
    expect(database.state.revocations).toEqual([]);
    expect(database.state.audits).toEqual([
      expect.objectContaining({
        actorStaffId: null,
        branchId: 1,
        action: "PASSWORD_RESET",
        entityType: "STAFF",
        entityId: 1,
        result: "SUCCESS",
        metadata: { source: "OWNER_BOOTSTRAP", rotated: false },
      }),
    ]);
  });

  it("rotate เฉพาะเมื่อ flag ตรง true พร้อม revoke และ audit ใน transaction เดียว", async () => {
    database.reset({ passwordHash: "existing-hash", mustChangePassword: false });

    await bootstrapOwner({
      BOOTSTRAP_OWNER_PASSWORD: password,
      BOOTSTRAP_OWNER_ROTATE: "true",
    });

    expect(database.state.owner?.passwordHash).toBe(hashSentinel);
    expect(database.state.revocations).toEqual(["PASSWORD_RESET"]);
    expect(database.state.audits[0]).toMatchObject({
      actorStaffId: null,
      metadata: { source: "OWNER_BOOTSTRAP", rotated: true },
    });
  });

  it("rollback เมื่อ update ไม่กระทบ row หรือ audit ล้มเหลว", async () => {
    database.setAffectedRows(0);
    await expect(
      bootstrapOwner({ BOOTSTRAP_OWNER_PASSWORD: password }),
    ).rejects.toThrow("OWNER001 update failed");
    expect(database.state.owner?.passwordHash).toBeNull();
    expect(database.state.audits).toEqual([]);

    database.reset();
    database.setFailAudit(true);
    await expect(
      bootstrapOwner({ BOOTSTRAP_OWNER_PASSWORD: password }),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");
    expect(database.state.owner?.passwordHash).toBeNull();
    expect(database.state.revocations).toEqual([]);
    expect(database.state.audits).toEqual([]);
  });

  it("CLI ไม่พิมพ์ secret/hash จาก dependency error และปิด pool ใน finally", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const close = vi.fn(async () => undefined);
    const execute = vi.fn(async () => {
      throw new Error(`${password}:${hashSentinel}`);
    });

    await expect(
      runBootstrapOwnerCli({ execute, close, stdout, stderr }),
    ).resolves.toBe(1);
    const output = JSON.stringify({ stdout: stdout.mock.calls, stderr: stderr.mock.calls });
    expect(output).not.toContain(password);
    expect(output).not.toContain(hashSentinel);
    expect(stderr).toHaveBeenCalledWith("Owner bootstrap failed.");
    expect(close).toHaveBeenCalledOnce();
  });

  // การโหลด npm + tsx บน Windows filesystem แบบ cold cache อาจเกิน 15 วินาที แม้ process ทำงานถูกต้อง
  it("CLI entrypoint โหลด server-only dependency ได้และคืน error แบบไม่เผยข้อมูล", { timeout: 60_000 }, () => {
    const environment = { ...process.env };
    delete environment.DATABASE_URL;
    delete environment.BOOTSTRAP_OWNER_PASSWORD;
    delete environment.BOOTSTRAP_OWNER_ROTATE;

    const npmCli = join(
      dirname(process.execPath),
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    );
    const result = spawnSync(
      process.platform === "win32" ? process.execPath : "npm",
      process.platform === "win32"
        ? [npmCli, "run", "--silent", "auth:bootstrap-owner"]
        : ["run", "--silent", "auth:bootstrap-owner"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: environment,
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe("Owner bootstrap failed.");
  });
});
