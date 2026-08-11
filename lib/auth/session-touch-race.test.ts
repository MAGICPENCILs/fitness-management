import type { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const requestNow = new Date("2026-08-10T04:30:00.000Z");
  const databaseNow = new Date("2026-08-10T04:30:02.000Z");
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
    idleExpiresAt: new Date("2026-08-10T04:30:01.000Z"),
    lastSeenAt: new Date("2026-08-10T04:25:00.000Z"),
  };
  const state: {
    affectedRows: number | null;
    updateValues: Record<string, unknown> | null;
    whereCondition: unknown;
  } = {
    affectedRows: null,
    updateValues: null,
    whereCondition: null,
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
    // จำลอง MySQL ประเมิน expiry ด้วยเวลาขณะ UPDATE ไม่ใช่เวลาต้น request
    state.affectedRows =
      row.absoluteExpiresAt.getTime() > databaseNow.getTime() &&
      row.idleExpiresAt.getTime() > databaseNow.getTime()
        ? 1
        : 0;
    if (state.affectedRows === 1 && state.updateValues) {
      row.lastSeenAt = state.updateValues.lastSeenAt as Date;
      row.idleExpiresAt = state.updateValues.idleExpiresAt as Date;
    }
    return [{ affectedRows: state.affectedRows }];
  });
  const updateSet = vi.fn((values: Record<string, unknown>) => {
    state.updateValues = values;
    return { where: updateWhere };
  });
  const db = {
    select: vi.fn(() => selectChain),
    update: vi.fn(() => ({ set: updateSet })),
  };

  return { databaseNow, db, requestNow, row, state };
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

describe("session touch compare-and-set", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(database.requestNow);
    database.state.affectedRows = null;
    database.state.updateValues = null;
    database.state.whereCondition = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ไม่ต่ออายุ session เมื่อ UPDATE เริ่มหลัง idle expiry แม้ request อ่าน row ตอนยัง active", async () => {
    expect(database.requestNow.getTime()).toBeLessThan(
      database.row.idleExpiresAt.getTime(),
    );
    expect(database.databaseNow.getTime()).toBeGreaterThanOrEqual(
      database.row.idleExpiresAt.getTime(),
    );
    const originalIdleExpiry = database.row.idleExpiresAt;
    const { getOptionalSession } = await import("@/lib/auth/session-service");

    await expect(getOptionalSession()).resolves.toMatchObject({
      authSessionId: 41,
      staffId: 1,
    });

    expect(database.state.updateValues).toMatchObject({
      lastSeenAt: database.requestNow,
      idleExpiresAt: new Date("2026-08-10T05:00:00.000Z"),
    });
    expect(database.state.affectedRows).toBe(0);
    expect(database.row.idleExpiresAt).toBe(originalIdleExpiry);

    const condition = database.state.whereCondition as {
      getSQL(): SQL;
    };
    const query = new MySqlDialect().sqlToQuery(condition.getSQL());
    expect(query.sql).toMatch(
      /absolute_expires_at.*>\s*CURRENT_TIMESTAMP/i,
    );
    expect(query.sql).toMatch(/idle_expires_at.*>\s*CURRENT_TIMESTAMP/i);
    expect(query.params).toEqual([41, "2026-08-10 04:25:00.000"]);
  });
});
