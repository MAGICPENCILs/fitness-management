import type { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const now = new Date("2026-08-10T04:30:00.000Z");
  const state: {
    affectedRows: number;
    whereCondition: unknown;
  } = {
    affectedRows: 0,
    whereCondition: null,
  };
  const row = {
    authSessionId: 41,
    sessionTokenHash: "a".repeat(64),
    staffId: 1,
    staffCode: "OWNER001",
    firstName: "สมชาย",
    lastName: "ใจดี",
    role: "OWNER" as const,
    homeBranchId: 1,
    branchName: "สาขาหลัก",
    staffStatus: "ACTIVE" as const,
    branchStatus: "ACTIVE" as const,
    mode: "FULL" as const,
    revokedAt: null,
    absoluteExpiresAt: new Date("2026-08-10T12:00:00.000Z"),
    idleExpiresAt: now,
    lastSeenAt: new Date("2026-08-10T04:25:00.000Z"),
  };

  const selectChain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(async () => [row]),
  };
  selectChain.from.mockReturnValue(selectChain);
  selectChain.innerJoin.mockReturnValue(selectChain);
  selectChain.where.mockReturnValue(selectChain);

  const updateWhere = vi.fn(async (condition: unknown) => {
    state.whereCondition = condition;
    return [{ affectedRows: state.affectedRows }];
  });
  const insertValues = vi.fn(async () => undefined);
  const transactionExecutor = {
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: updateWhere })),
    })),
    insert: vi.fn(() => ({ values: insertValues })),
  };
  const db = {
    select: vi.fn(() => selectChain),
    transaction: vi.fn(
      async (
        callback: (
          executor: typeof transactionExecutor,
        ) => Promise<unknown>,
      ) => callback(transactionExecutor),
    ),
  };

  return {
    db,
    insertValues,
    now,
    state,
  };
});

vi.mock("@/db", () => ({ db: database.db }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => ({ value: "signed-cookie" })),
  })),
}));
vi.mock("@/lib/auth/session-token", () => ({
  hashSessionId: vi.fn(() => "a".repeat(64)),
  verifySessionClaims: vi.fn(async () => ({
    sessionId: "raw-session-id",
    staffId: 1,
    role: "OWNER",
    homeBranchId: 1,
    mode: "FULL",
    expiresAt: Math.floor(
      new Date("2026-08-10T12:00:00.000Z").getTime() / 1_000,
    ),
  })),
}));

describe("session expiration compare-and-set", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(database.now);
    database.state.affectedRows = 0;
    database.state.whereCondition = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ไม่ revoke หรือเขียน audit เมื่อ concurrent touch ทำให้ row ไม่หมดอายุก่อน expire update", async () => {
    const { getOptionalSession } = await import("@/lib/auth/session-service");

    await expect(getOptionalSession()).resolves.toBeNull();

    expect(database.insertValues).not.toHaveBeenCalled();
    const condition = database.state.whereCondition as {
      getSQL(): SQL;
    };
    const query = new MySqlDialect().sqlToQuery(condition.getSQL());
    expect(query.sql).toMatch(
      /absolute_expires_at.*<=.*\bor\b.*idle_expires_at.*<=/i,
    );
    expect(query.params).toEqual([
      41,
      "2026-08-10 04:30:00.000",
      "2026-08-10 04:30:00.000",
    ]);
  });

  it("เขียน SESSION_EXPIRED ครั้งเดียวเมื่อ expiry CAS เปลี่ยน row สำเร็จ", async () => {
    database.state.affectedRows = 1;
    const { getOptionalSession } = await import("@/lib/auth/session-service");

    await expect(getOptionalSession()).resolves.toBeNull();

    expect(database.insertValues).toHaveBeenCalledTimes(1);
    expect(database.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SESSION_EXPIRED",
        entityId: 41,
      }),
    );
  });
});
