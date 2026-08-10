import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const adapter = vi.hoisted(() => {
  const pool = { kind: "pool" };
  return {
    pool,
    createPool: vi.fn(() => pool),
    createConnection: vi.fn(),
    drizzle: vi.fn((client: unknown) => ({ client })),
  };
});

vi.mock("mysql2/promise", () => ({
  default: {
    createPool: adapter.createPool,
    createConnection: adapter.createConnection,
  },
}));

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: adapter.drizzle,
}));

const originalDatabaseUrl = process.env.DATABASE_URL;

describe("database adapter", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.DATABASE_URL = "mysql://user:secret@db.example/fitness";
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("uses a pool so concurrent Drizzle transactions lease independent connections", async () => {
    const { db } = await import("@/db");

    expect(adapter.createConnection).not.toHaveBeenCalled();
    expect(adapter.createPool).toHaveBeenCalledWith({
      uri: "mysql://user:secret@db.example/fitness",
      charset: "utf8mb4_unicode_ci",
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
    expect(adapter.drizzle).toHaveBeenCalledWith(adapter.pool);
    expect(db).toEqual({ client: adapter.pool });
  });
});
