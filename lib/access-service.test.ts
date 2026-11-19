import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type Table } from "drizzle-orm";
import { accessLogs, accessSettings, cardPool, memberAccessTokens, memberPackages, members, notifications, packages } from "@/db/schema";
import type { DbTransaction } from "@/lib/audit-service";

vi.mock("@/db", () => ({ db: {} }));
import { getAccessSettings, processCardScan } from "./access-service";

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
    freezeDaysUsed: 0, status: "ACTIVE", paidAmount: 1000, packageType: "MONTHLY", createdAt: now, updatedAt: now,
  };
  const state = {
    member, memberPackage, memberPackages: [memberPackage], graceDays: 3, settingsPresent: true, events: [] as string[],
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
      if (table === memberPackages) return state.memberPackages;
      if (table === packages) return [];
      if (table === accessSettings) return state.settingsPresent ? [{ id: 1, graceDays: state.graceDays }] : [];
      if (table === accessLogs) return state.logs;
      if (table === notifications) return state.warnings;
      throw new Error(`UNEXPECTED_SELECT ${getTableName(table)}`);
    };
    const query = {
      from(value: Table) { table = value; return query; }, innerJoin() { return query; },
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
        if (table === accessLogs) {
          const values = [value].flat();
          for (const item of values) {
            if (item.dailyUseDate && state.logs.some(log =>
              log.memberId === item.memberId && log.dailyUseDate === item.dailyUseDate,
            )) throw Object.assign(new Error("duplicate daily use"), { code: "ER_DUP_ENTRY" });
          }
          state.logs.push(...values);
        }
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
  it("ใช้ grace 3 วันเมื่อยังไม่มีแถว access settings", async () => {
    fixture.state.settingsPresent = false;
    expect(await getAccessSettings(fixture.tx as never)).toEqual({ id: 1, graceDays: 3 });
  });

  it.each(["CARD-007", "FQR.test-token"])("locks the member before package evaluation and access-log insertion for %s", async serial => {
    expect(await processCardScan(fixture.tx, 10, serial, now)).toMatchObject({ result: "APPROVED", warning: "เหลืออีก 6 วัน" });
    expect(fixture.state.events.slice(0, 5)).toEqual([
      serial.startsWith("FQR.") ? "read:member_access_tokens" : "read:card_pool",
      "lock:update:members", "read:member_packages", "read:access_settings", "insert:access_logs",
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

  it("เลือกแพ็กเกจปัจจุบันแทนแพ็กเกจต่ออายุที่ยังไม่เริ่ม", async () => {
    fixture.state.memberPackages = [
      { ...fixture.state.memberPackage, id: 10, startDate: "2026-12-01", expireDate: "2026-12-31" },
      { ...fixture.state.memberPackage, id: 9, startDate: "2026-11-01", expireDate: "2026-11-09" },
    ];

    expect(await processCardScan(fixture.tx, 10, "CARD-007", now)).toMatchObject({
      result: "APPROVED",
      member: { expireDate: "2026-11-09" },
    });
  });

  it("ปฏิเสธแพ็กเกจ DAILY เมื่อสแกนซ้ำในวันไทยเดียวกัน", async () => {
    fixture.state.memberPackage.packageType = "DAILY";

    await expect(processCardScan(fixture.tx, 10, "CARD-007", now)).resolves.toMatchObject({ result: "APPROVED" });
    expect(fixture.state.logs.at(-1)).toMatchObject({
      memberId: 7,
      result: "APPROVED",
      dailyUseDate: "2026-11-03",
      scannedAt: now,
    });

    expect(await processCardScan(fixture.tx, 10, "CARD-007", now)).toEqual({
      result: "REJECTED",
      reason: "สิทธิ์รายวันถูกใช้แล้ววันนี้",
    });
    expect(fixture.state.logs.at(-1)).toMatchObject({ result: "REJECTED", reason: "สิทธิ์รายวันถูกใช้แล้ววันนี้" });
  });

  it("อนุมัติ DAILY อีกครั้งหลังข้ามเที่ยงคืนตามเวลาไทย", async () => {
    fixture.state.memberPackage.packageType = "DAILY";
    const beforeMidnight = new Date("2026-11-03T16:59:59Z");
    const afterMidnight = new Date("2026-11-03T17:00:00Z");

    await expect(processCardScan(fixture.tx, 10, "CARD-007", beforeMidnight)).resolves.toMatchObject({ result: "APPROVED" });
    await expect(processCardScan(fixture.tx, 10, "CARD-007", afterMidnight)).resolves.toMatchObject({ result: "APPROVED" });
    expect(fixture.state.logs.filter(log => log.result === "APPROVED")).toMatchObject([
      { dailyUseDate: "2026-11-03", scannedAt: beforeMidnight },
      { dailyUseDate: "2026-11-04", scannedAt: afterMidnight },
    ]);
  });

  it("อนุมัติใน grace และบันทึก warning โดยไม่แสดงจำนวนวันคงเหลือติดลบ", async () => {
    fixture.state.memberPackage.expireDate = "2026-11-02";

    expect(await processCardScan(fixture.tx, 10, "CARD-007", now)).toMatchObject({
      result: "APPROVED",
      warning: "อยู่ในช่วงผ่อนผันอีก 2 วัน",
      member: { daysLeft: -1 },
    });
    expect(fixture.state.warnings).toMatchObject([{ title: "แจ้งเตือน ณ จุดสแกน: อยู่ในช่วงผ่อนผัน" }]);
  });
});
