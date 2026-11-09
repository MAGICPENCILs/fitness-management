import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type Table } from "drizzle-orm";
import { accessLogs, cardPool, memberAccessTokens, memberPackages, members, notifications } from "@/db/schema";
import type { DbTransaction } from "@/lib/audit-service";

vi.mock("@/db", () => ({ db: {} }));
import { processCardScan } from "./access-service";

const now = new Date("2026-11-03T01:00:00Z");

/** จำลองเฉพาะ DB boundary เพื่อสังเกตลำดับล็อกและจำลอง warning ล้มเหลว โดยใช้ service จริง */
function scanTestDb() {
  const member = {
    id: 7, homeBranchId: 10, memberCode: "M007", firstName: "Test", lastName: "Member",
    idCard: null, phone: null, email: null, birthDate: null, gender: null, address: null,
    photoUrl: null, status: "ACTIVE", note: null, createdAt: now, updatedAt: now,
  };
  const memberPackage = {
    id: 9, memberId: 7, packageId: 1, startDate: "2026-11-01", expireDate: "2026-11-09",
    freezeDaysUsed: 0, status: "ACTIVE", paidAmount: 1000, createdAt: now, updatedAt: now,
  };
  const state = {
    member, memberPackage, events: [] as string[],
    logs: [] as Record<string, unknown>[], warnings: [] as Record<string, unknown>[],
    warningError: null as Error | null,
  };
  const select = () => {
    let table: Table;
    let lock: string | undefined;
    const rows = async () => {
      state.events.push(`${lock ? `lock:${lock}` : "read"}:${getTableName(table)}`);
      if (table === cardPool) return [{ memberId: 7, status: "IN_USE" }];
      if (table === memberAccessTokens) return [{ memberId: 7 }];
      if (table === members) return [state.member];
      if (table === memberPackages) return [state.memberPackage];
      if (table === notifications) return state.warnings;
      throw new Error(`UNEXPECTED_SELECT ${getTableName(table)}`);
    };
    const query = {
      from(value: Table) { table = value; return query; },
      where() { return query; }, limit() { return query; }, orderBy() { return query; },
      for(value: string) { lock = value; return query; },
      then(resolve: (value: Record<string, unknown>[]) => unknown, reject: (error: unknown) => unknown) { return rows().then(resolve, reject); },
    };
    return query;
  };
  const insert = (table: Table) => {
    const query = {
      ignore() { return query; },
      async values(value: Record<string, unknown> | Record<string, unknown>[]) {
        state.events.push(`insert:${getTableName(table)}`);
        if (table === notifications && state.warningError) throw state.warningError;
        if (table === accessLogs) state.logs.push(...[value].flat());
        else if (table === notifications) state.warnings.push(...[value].flat());
        else throw new Error(`UNEXPECTED_INSERT ${getTableName(table)}`);
        return [{ affectedRows: 1 }];
      },
    };
    return query;
  };
  return { state, tx: { select, insert } as unknown as DbTransaction };
}

let fixture: ReturnType<typeof scanTestDb>;
beforeEach(() => { fixture = scanTestDb(); });

describe("scan transaction safety", () => {
  it.each(["CARD-007", "FQR.test-token"])("locks the member before package evaluation and access-log insertion for %s", async serial => {
    expect(await processCardScan(fixture.tx, 10, serial, now)).toMatchObject({ result: "APPROVED", warning: "เหลืออีก 6 วัน" });
    expect(fixture.state.events.slice(0, 4)).toEqual([
      serial.startsWith("FQR.") ? "read:member_access_tokens" : "read:card_pool",
      "lock:update:members", "read:member_packages", "insert:access_logs",
    ]);
    expect(fixture.state.logs).toMatchObject([{ memberId: 7, result: "APPROVED" }]);
    expect(fixture.state.warnings).toMatchObject([{ memberId: 7, type: "SCAN_WARNING" }]);
  });

  it("rejects instead of returning APPROVED when recording the warning fails", async () => {
    const error = new Error("ER_LOCK_DEADLOCK");
    fixture.state.warningError = error;
    await expect(processCardScan(fixture.tx, 10, "CARD-007", now)).rejects.toBe(error);
  });

  it("preserves approval without a warning when the package is not near expiry", async () => {
    fixture.state.memberPackage.expireDate = "2026-11-30";
    expect(await processCardScan(fixture.tx, 10, "CARD-007", now)).toMatchObject({ result: "APPROVED", warning: null, member: { daysLeft: 27 } });
    expect(fixture.state.logs).toMatchObject([{ result: "APPROVED", reason: null }]);
    expect(fixture.state.warnings).toEqual([]);
  });

  it("preserves rejection and its access log for a suspended member", async () => {
    fixture.state.member.status = "SUSPENDED";
    expect(await processCardScan(fixture.tx, 10, "CARD-007", now)).toEqual({ result: "REJECTED", reason: "สมาชิกถูกระงับ" });
    expect(fixture.state.logs).toMatchObject([{ memberId: 7, result: "REJECTED", reason: "สมาชิกถูกระงับ" }]);
    expect(fixture.state.warnings).toEqual([]);
  });
});
