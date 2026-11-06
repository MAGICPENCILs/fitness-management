import { beforeEach, describe, expect, it, vi } from "vitest";

const sentinelAuditError = Object.assign(
  new Error("SQL PARAM TOKEN HASH CODE IP SERIAL NOTE SENTINEL"),
  {
    name: "SECRET_DYNAMIC_NAME",
    sql: "SELECT token FROM private_table",
    params: ["PRIVATE_PARAM"],
    stack: "PRIVATE_STACK",
  },
);

const database = vi.hoisted(() => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => Promise<unknown>) => callback({})),
    insert: vi.fn(() => ({
      values: vi.fn(async () => {
        throw sentinelAuditError;
      }),
    })),
  },
}));

vi.mock("@/db", () => ({ db: database.db }));

import { runAuditedMutation } from "@/lib/audit-service";

describe("audited mutation fallback logging", () => {
  beforeEach(() => vi.clearAllMocks());

  it("log เฉพาะ fixed label เมื่อ FAILED audit ล้มและยังโยน mutation error เดิม", async () => {
    const originalError = new Error("ORIGINAL_MUTATION_ERROR");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      runAuditedMutation(
        {
          actorStaffId: 2,
          branchId: 10,
          action: "EQUIPMENT_MASTER_UPDATED",
          entityType: "EQUIPMENT",
        },
        async () => {
          throw originalError;
        },
      ),
    ).rejects.toBe(originalError);

    expect(consoleError).toHaveBeenCalledWith("Failed to write FAILED audit");
    const logged = JSON.stringify(consoleError.mock.calls);
    for (const sentinel of [
      "SENTINEL",
      "SECRET_DYNAMIC_NAME",
      "SELECT token",
      "PRIVATE_PARAM",
      "PRIVATE_STACK",
    ]) {
      expect(logged).not.toContain(sentinel);
    }
  });
});
