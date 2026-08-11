import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  type Target = {
    id: number;
    staffCode: string;
    firstName: string;
    lastName: string;
    homeBranchId: number;
    role: "OWNER" | "MANAGER" | "COUNTER" | "TRAINER";
    phone: string | null;
    email: string | null;
    status: "ACTIVE" | "INACTIVE";
    passwordHash: string | null;
    passwordChangedAt: Date | null;
    mustChangePassword: boolean;
  };

  type State = {
    target: Target | null;
    insertedStaff: Array<Record<string, unknown>>;
    audits: Array<Record<string, unknown>>;
    revocations: string[];
  };

  const state: State = {
    target: null,
    insertedStaff: [],
    audits: [],
    revocations: [],
  };
  let affectedRows = 1;
  let failAudit = false;

  const cloneState = (): State => ({
    target: state.target ? { ...state.target } : null,
    insertedStaff: state.insertedStaff.map((row) => ({ ...row })),
    audits: state.audits.map((row) => ({ ...row })),
    revocations: [...state.revocations],
  });

  const createExecutor = (working: State) => ({
    select: vi.fn(() => {
      const chain = {
        from: vi.fn(),
        where: vi.fn(),
        limit: vi.fn(),
        for: vi.fn(async () => (working.target ? [{ ...working.target }] : [])),
      };
      chain.from.mockReturnValue(chain);
      chain.where.mockReturnValue(chain);
      chain.limit.mockReturnValue(chain);
      return chain;
    }),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        if ("action" in values) {
          if (failAudit) throw new Error("AUDIT_WRITE_FAILED");
          working.audits.push({ ...values });
          return undefined;
        }
        working.insertedStaff.push({ ...values });
        return [{ insertId: 81 }];
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          if (affectedRows === 0) return [{ affectedRows: 0 }];
          if ("revokedReason" in values) {
            working.revocations.push(String(values.revokedReason));
          } else if (working.target) {
            working.target = { ...working.target, ...values } as Target;
          }
          return [{ affectedRows: 1 }];
        }),
      })),
    })),
  });

  const db = {
    transaction: vi.fn(async <T>(callback: (tx: ReturnType<typeof createExecutor>) => Promise<T>) => {
      const working = cloneState();
      const result = await callback(createExecutor(working));
      state.target = working.target;
      state.insertedStaff = working.insertedStaff;
      state.audits = working.audits;
      state.revocations = working.revocations;
      return result;
    }),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        state.audits.push({ ...values });
      }),
    })),
  };

  return {
    db,
    state,
    reset(target?: Partial<Target> | null) {
      state.target = target === null ? null : {
        id: 41,
        staffCode: "COUNTER041",
        firstName: "สมชาย",
        lastName: "ใจดี",
        homeBranchId: 2,
        role: "COUNTER",
        phone: null,
        email: null,
        status: "ACTIVE",
        passwordHash: "old-hash",
        passwordChangedAt: null,
        mustChangePassword: false,
        ...target,
      };
      state.insertedStaff = [];
      state.audits = [];
      state.revocations = [];
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

vi.mock("@/db", () => ({ db: database.db }));
vi.mock("@/lib/auth/session-service", { spy: true });
vi.mock("@/lib/auth/password", { spy: true });

import { hashPassword } from "@/lib/auth/password";
import { requireFullSession } from "@/lib/auth/session-service";
import {
  AuthorizationError,
  createStaff,
  resetStaffPassword,
  StaffOperationError,
  updateStaff,
} from "@/lib/staff-service";
import { createStaffSchema } from "@/lib/staff-validation";
import { POST as createStaffPost } from "@/app/api/staff/route";

const validPassword = "StrongPass#2026";
const manager = { staffId: 7, role: "MANAGER" as const, homeBranchId: 2 };
const owner = { staffId: 1, role: "OWNER" as const, homeBranchId: 1 };
const staffInput = {
  staffCode: "COUNTER081",
  firstName: "สายใจ",
  lastName: "บริการ",
  homeBranchId: 2,
  role: "COUNTER" as const,
  phone: "",
  email: "",
  status: "ACTIVE" as const,
};

describe("Staff password lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.reset();
    vi.mocked(hashPassword).mockResolvedValue("argon-hash-sentinel");
    vi.mocked(requireFullSession).mockResolvedValue({
      authSessionId: 91,
      staffId: manager.staffId,
      staffCode: "MANAGER007",
      firstName: "มานะ",
      lastName: "จัดการ",
      role: manager.role,
      homeBranchId: manager.homeBranchId,
      branchName: "สาขา 2",
      mode: "FULL",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ปฏิเสธการสร้าง Staff เมื่อไม่มีรหัสชั่วคราวหรือ confirmation ไม่ตรงกัน", () => {
    expect(createStaffSchema.safeParse(staffInput).success).toBe(false);
    expect(
      createStaffSchema.safeParse({
        ...staffInput,
        temporaryPassword: validPassword,
        passwordConfirmation: "DifferentPass#2026",
      }).success,
    ).toBe(false);
  });

  it("ยอมรับช่องทางติดต่อ optional ที่ UI ส่งเป็นค่าว่างตอนสร้าง Staff", () => {
    expect(
      createStaffSchema.safeParse({
        ...staffInput,
        temporaryPassword: validPassword,
        passwordConfirmation: validPassword,
      }).success,
    ).toBe(true);
  });

  it("route สร้าง Staff ปฏิเสธ Origin ที่ไม่ตรงด้วย 403", async () => {
    vi.stubEnv("APP_ORIGIN", "https://fitness.example");
    const response = await createStaffPost(
      new Request("https://fitness.example/api/staff", {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...staffInput,
          email: "staff@example.com",
          temporaryPassword: validPassword,
          passwordConfirmation: validPassword,
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(database.db.transaction).not.toHaveBeenCalled();
  });

  it("route สร้าง Staff ตอบ 400 สำหรับ JSON ที่อ่านไม่ได้โดยไม่เรียก service", async () => {
    vi.stubEnv("APP_ORIGIN", "https://fitness.example");
    const response = await createStaffPost(
      new Request("https://fitness.example/api/staff", {
        method: "POST",
        headers: {
          origin: "https://fitness.example",
          "content-type": "application/json",
        },
        body: "{invalid-json",
      }),
    );

    expect(response.status).toBe(400);
    expect(database.db.transaction).not.toHaveBeenCalled();
  });

  it("hash รหัสชั่วคราวก่อนสร้างและไม่ส่ง plaintext เข้า Staff row หรือ audit", async () => {
    await createStaff({
      ...staffInput,
      temporaryPassword: validPassword,
      passwordConfirmation: validPassword,
    });

    expect(hashPassword).toHaveBeenCalledWith(validPassword);
    expect(database.state.insertedStaff).toHaveLength(1);
    expect(database.state.insertedStaff[0]).toMatchObject({
      passwordHash: "argon-hash-sentinel",
      mustChangePassword: true,
    });
    expect(database.state.insertedStaff[0]).not.toHaveProperty("temporaryPassword");
    expect(database.state.insertedStaff[0]).not.toHaveProperty("passwordConfirmation");
    expect(JSON.stringify(database.state.audits)).not.toContain(validPassword);
    expect(JSON.stringify(database.state.audits)).not.toContain("argon-hash-sentinel");
  });

  it("Manager reset Owner หรือ Staff นอกสาขาหลักไม่ได้", async () => {
    database.reset({ role: "OWNER", homeBranchId: 2 });
    await expect(
      resetStaffPassword(manager, 41, validPassword),
    ).rejects.toBeInstanceOf(AuthorizationError);

    database.reset({ role: "COUNTER", homeBranchId: 3 });
    await expect(
      resetStaffPassword(manager, 41, validPassword),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("Manager reset Staff ที่ inactive ในสาขาหลักได้ และ target ที่หายตอบ 404", async () => {
    database.reset({ status: "INACTIVE" });
    await expect(
      resetStaffPassword(manager, 41, validPassword),
    ).resolves.toBeUndefined();
    expect(database.state.revocations).toEqual(["PASSWORD_RESET"]);

    database.reset(null);
    await expect(
      resetStaffPassword(manager, 41, validPassword),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("reset hash รหัส บังคับเปลี่ยน revoke session และ audit ใน transaction เดียว", async () => {
    await resetStaffPassword(owner, 41, validPassword);

    expect(database.state.target).toMatchObject({
      passwordHash: "argon-hash-sentinel",
      mustChangePassword: true,
    });
    expect(database.state.revocations).toEqual(["PASSWORD_RESET"]);
    expect(database.state.audits).toContainEqual(
      expect.objectContaining({
        actorStaffId: owner.staffId,
        action: "PASSWORD_RESET",
        entityType: "STAFF",
        entityId: 41,
        result: "SUCCESS",
      }),
    );
  });

  it("rollback password และ session revocation เมื่อเขียน reset audit ไม่สำเร็จ", async () => {
    database.setFailAudit(true);

    await expect(resetStaffPassword(owner, 41, validPassword)).rejects.toThrow(
      "AUDIT_WRITE_FAILED",
    );
    expect(database.state.target).toMatchObject({
      passwordHash: "old-hash",
      mustChangePassword: false,
    });
    expect(database.state.revocations).toEqual([]);
    expect(database.state.audits).toEqual([]);
  });

  it("route ไม่ส่ง plaintext หรือ hash sentinel ออกทาง response และ server log เมื่อ transaction ล้มเหลว", async () => {
    vi.stubEnv("APP_ORIGIN", "https://fitness.example");
    database.setFailAudit(true);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await createStaffPost(
      new Request("https://fitness.example/api/staff", {
        method: "POST",
        headers: {
          origin: "https://fitness.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...staffInput,
          email: "staff@example.com",
          temporaryPassword: validPassword,
          passwordConfirmation: validPassword,
        }),
      }),
    );
    const output = JSON.stringify({
      body: await response.json(),
      log: consoleError.mock.calls,
    });

    expect(response.status).toBe(500);
    expect(output).not.toContain(validPassword);
    expect(output).not.toContain("argon-hash-sentinel");
    consoleError.mockRestore();
  });

  it("ปฏิเสธ reset เมื่อ target update ไม่กระทบ row และ rollback side effects", async () => {
    database.setAffectedRows(0);

    await expect(resetStaffPassword(owner, 41, validPassword)).rejects.toBeInstanceOf(
      StaffOperationError,
    );
    expect(database.state.revocations).toEqual([]);
    expect(database.state.audits).toEqual([]);
  });

  it("revoke session เฉพาะเมื่อ role สาขา หรือ status เปลี่ยน", async () => {
    await updateStaff(41, { ...staffInput, staffCode: "COUNTER041" });
    expect(database.state.revocations).toEqual([]);

    database.reset();
    await updateStaff(41, {
      ...staffInput,
      staffCode: "COUNTER041",
      role: "TRAINER",
    });
    expect(database.state.revocations).toEqual(["STAFF_UPDATED"]);
  });

  it("update re-authorize จาก target ที่ lock ใน transaction และกัน Manager แก้ Owner", async () => {
    database.reset({ role: "OWNER", homeBranchId: 2 });

    await expect(
      updateStaff(41, { ...staffInput, staffCode: "OWNER041" }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(database.state.audits).toEqual([]);
    expect(database.state.revocations).toEqual([]);
  });

  it("rollback Staff update และ revoke เมื่อ audit ล้มเหลว และไม่ audit เมื่อ affectedRows เป็นศูนย์", async () => {
    database.setFailAudit(true);
    await expect(
      updateStaff(41, {
        ...staffInput,
        staffCode: "COUNTER041",
        role: "TRAINER",
      }),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");
    expect(database.state.target?.role).toBe("COUNTER");
    expect(database.state.revocations).toEqual([]);
    expect(database.state.audits).toEqual([]);

    database.reset();
    database.setAffectedRows(0);
    await expect(
      updateStaff(41, {
        ...staffInput,
        staffCode: "COUNTER041",
        role: "TRAINER",
      }),
    ).rejects.toBeInstanceOf(StaffOperationError);
    expect(database.state.revocations).toEqual([]);
    expect(database.state.audits).toEqual([]);
  });
});
