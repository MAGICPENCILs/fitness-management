import { createHash } from "node:crypto";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLogs, consentEvents, members, memberLineLinks } from "@/db/schema";

const mocks = vi.hoisted(() => ({ select: vi.fn(), transaction: vi.fn() }));
vi.mock("@/db", () => ({ db: mocks }));
import { completeLineLinkChallenge, getLineLinkStatus, issueLineLinkChallenge, removeLineLink } from "@/lib/line-link-service";

const actor = { staffId: 3, role: "COUNTER" as const, homeBranchId: 10 };
const now = new Date("2026-11-08T00:00:00Z");
const userId = `U${"a".repeat(32)}`;
type Link = typeof memberLineLinks.$inferSelect;
let member: { id: number; homeBranchId: number; status: string } | undefined;
let link: Link | undefined;
let consent: string;
let audits: Record<string, unknown>[];
let locks: string[];
let failAudit: boolean;
let updateError: unknown;
let candidateHook: (() => void) | undefined;
let consentHook: (() => void) | undefined;

/** จำลองเฉพาะ DB boundary พร้อม rollback และ lock trace; ไม่แตะ provider หรือฐานข้อมูลจริง */
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); vi.resetAllMocks();
  member = { id: 7, homeBranchId: 10, status: "ACTIVE" }; link = undefined;
  consent = "GRANTED"; audits = []; locks = []; failAudit = false; updateError = undefined; candidateHook = undefined; consentHook = undefined;
  const select = (transaction: boolean) => () => {
    let table: unknown; let condition: Parameters<MySqlDialect["sqlToQuery"]>[0];
    const rows = () => {
      const params = condition ? new MySqlDialect().sqlToQuery(condition).params : [];
      if (table === members) return member && params.includes(member.id) ? [{ ...member }] : [];
      if (table === memberLineLinks) {
        const found = link && (params.includes(link.memberId) || params.includes(link.challengeHash)) ? [{ ...link }] : [];
        if (!transaction) candidateHook?.();
        return found;
      }
      if (table === consentEvents) {
        if (!locks.includes("member") || !locks.includes("link")) throw new Error("CONSENT_BEFORE_LOCK");
        consentHook?.();
        return [{ action: consent }];
      }
      throw new Error("UNEXPECTED_TABLE");
    };
    const query = {
      from(value: unknown) { table = value; return query; }, where(value: typeof condition) { condition = value; return query; },
      limit() { return query; }, orderBy() { return query; },
      async for() { locks.push(table === members ? "member" : table === memberLineLinks ? "link" : "consent"); return rows(); },
      then(resolve: (value: unknown[]) => unknown) { return Promise.resolve(rows()).then(resolve); },
    }; return query;
  };
  const insert = (table: unknown) => ({ values: async (value: Record<string, unknown>) => {
    if (table === auditLogs) { if (failAudit) throw new Error("PRIVATE_AUDIT_FAILURE"); audits.push(value); }
    else if (table === memberLineLinks) link = { ...value } as Link;
    else throw new Error("UNEXPECTED_INSERT");
    return [{ affectedRows: 1 }];
  } });
  const update = () => ({ set: (value: Partial<Link>) => ({ where: async () => {
    if (updateError) throw updateError;
    if (link) Object.assign(link, value); return [{ affectedRows: 1 }];
  } }) });
  const remove = () => ({ where: async () => { link = undefined; return [{ affectedRows: 1 }]; } });
  mocks.select.mockImplementation(select(false));
  let tail = Promise.resolve();
  mocks.transaction.mockImplementation(async (callback) => {
    const beforeTail = tail; let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; }); await beforeTail;
    locks = []; const snapshot = structuredClone({ link, audits });
    try { return await callback({ select: select(true), insert, update, delete: remove }); }
    catch (error) { link = snapshot.link; audits = snapshot.audits; throw error; }
    finally { release(); }
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("LINE linking service", () => {
  it("rotates challenges, hashes tokens, exposes only status on GET and consumes once without delivery", async () => {
    const fetch = vi.fn(() => { throw new Error("NO_NETWORK"); }); vi.stubGlobal("fetch", fetch);
    const first = await issueLineLinkChallenge(actor, 7);
    expect(first).toMatchObject({ status: "PENDING", linkedAt: null, challengeExpiresAt: "2026-11-08T00:15:00.000Z" });
    expect(first.command).toMatch(/^LINK [A-Za-z0-9_-]{43}$/);
    const token = first.command.slice(5);
    expect(link?.challengeHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(JSON.stringify(link)).not.toContain(token);
    const second = await issueLineLinkChallenge(actor, 7);
    expect(second.command).not.toBe(first.command);
    expect(await completeLineLinkChallenge(token, userId)).toBe(false);
    expect(await getLineLinkStatus(actor, 7)).toEqual({ status: "PENDING", linkedAt: null, challengeExpiresAt: "2026-11-08T00:15:00.000Z" });
    expect(await completeLineLinkChallenge(second.command.slice(5), userId)).toBe(true);
    expect(locks).toEqual(["member", "link", "consent"]);
    expect(link).toMatchObject({ lineUserId: userId, linkedAt: now, challengeHash: null, challengeExpiresAt: null });
    expect(await completeLineLinkChallenge(second.command.slice(5), userId)).toBe(false);
    expect(await getLineLinkStatus(actor, 7)).toEqual({ status: "LINKED", linkedAt: now.toISOString(), challengeExpiresAt: null });
    expect(audits.map(row => row.action)).toEqual(["LINE_LINK_CHALLENGE_ISSUED", "LINE_LINK_CHALLENGE_ISSUED", "LINE_LINK_COMPLETED"]);
    expect(audits[2].actorStaffId).toBeNull();
    expect(JSON.stringify(audits)).not.toMatch(new RegExp(`${token}|${userId}|challengeHash`));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects POST on LINKED with fixed 409 and no mutation or audit", async () => {
    const issued = await issueLineLinkChallenge(actor, 7); await completeLineLinkChallenge(issued.command.slice(5), userId);
    const snapshot = structuredClone({ link, audits });
    await expect(issueLineLinkChallenge(actor, 7)).rejects.toMatchObject({ status: 409, message: "สมาชิกเชื่อมต่อ LINE แล้ว กรุณายกเลิกก่อน" });
    expect({ link, audits }).toEqual(snapshot);
  });

  it("does not complete or audit expired tokens; expired DELETE is idempotent", async () => {
    const issued = await issueLineLinkChallenge(actor, 7); vi.setSystemTime(new Date("2026-11-08T00:15:00Z"));
    expect(await getLineLinkStatus(actor, 7)).toEqual({ status: "UNLINKED", linkedAt: null, challengeExpiresAt: null });
    expect(await completeLineLinkChallenge(issued.command.slice(5), userId)).toBe(false);
    await removeLineLink(actor, 7); expect(audits).toHaveLength(1);
  });

  it("removes pending and linked records atomically and audits each actual removal only", async () => {
    await removeLineLink(actor, 7); expect(audits).toHaveLength(0);
    await issueLineLinkChallenge(actor, 7); await removeLineLink(actor, 7); expect(link).toBeUndefined();
    const issued = await issueLineLinkChallenge(actor, 7); await completeLineLinkChallenge(issued.command.slice(5), userId);
    await removeLineLink(actor, 7); await removeLineLink(actor, 7);
    expect(audits.filter(row => row.action === "LINE_LINK_REMOVED")).toHaveLength(2);
    expect(await getLineLinkStatus(actor, 7)).toEqual({ status: "UNLINKED", linkedAt: null, challengeExpiresAt: null });
  });

  it.each(["TRAINER", "MANAGER", "COUNTER"] as const)("blocks %s outside resource scope for every staff operation", async role => {
    for (const operation of [getLineLinkStatus, issueLineLinkChallenge, removeLineLink]) await expect(operation({ ...actor, role, homeBranchId: role === "TRAINER" ? 10 : 11 }, 7)).rejects.toMatchObject({ status: 403 });
    expect(link).toBeUndefined(); expect(audits).toEqual([]);
  });

  it("allows Owner cross-branch and checks SERVICE_PRIVACY and CANCELLED under member lock", async () => {
    await issueLineLinkChallenge({ ...actor, role: "OWNER", homeBranchId: 11 }, 7);
    consent = "WITHDRAWN"; await expect(issueLineLinkChallenge(actor, 7)).rejects.toMatchObject({ status: 409 });
    consent = "GRANTED"; member!.status = "CANCELLED";
    await expect(issueLineLinkChallenge(actor, 7)).rejects.toMatchObject({ status: 409 });
  });

  it.each(["rotated", "removed", "branch", "cancelled", "consent", "missing-member"])("rechecks %s after candidate lookup and locking without a stale snapshot", async kind => {
    const issued = await issueLineLinkChallenge(actor, 7);
    candidateHook = () => { candidateHook = undefined;
      if (kind === "rotated") link!.challengeHash = "f".repeat(64);
      if (kind === "removed") link = undefined;
      if (kind === "branch") member!.homeBranchId = 11;
      if (kind === "cancelled") member!.status = "CANCELLED";
      if (kind === "consent") consent = "WITHDRAWN";
      if (kind === "missing-member") member = undefined;
    };
    expect(await completeLineLinkChallenge(issued.command.slice(5), userId)).toBe(false);
    expect(audits).toHaveLength(1);
  });

  it("lets one concurrent replay consume the challenge", async () => {
    const issued = await issueLineLinkChallenge(actor, 7);
    expect(await Promise.all([completeLineLinkChallenge(issued.command.slice(5), userId), completeLineLinkChallenge(issued.command.slice(5), userId)])).toEqual([true, false]);
    expect(audits.filter(row => row.action === "LINE_LINK_COMPLETED")).toHaveLength(1);
  });

  it("does not consume a challenge that expires while the locked consent read is in flight", async () => {
    const issued = await issueLineLinkChallenge(actor, 7);
    consentHook = () => { vi.setSystemTime(new Date("2026-11-08T00:15:00Z")); };
    expect(await completeLineLinkChallenge(issued.command.slice(5), userId)).toBe(false);
    expect(link?.lineUserId).toBeNull(); expect(audits).toHaveLength(1);
  });

  it("treats unique ownership conflict as no-op but propagates DB/deadlock/audit failures", async () => {
    const issued = await issueLineLinkChallenge(actor, 7); const token = issued.command.slice(5);
    updateError = new Error("query failed", { cause: Object.assign(new Error("PRIVATE_SQL"), { code: "ER_DUP_ENTRY" }) });
    expect(await completeLineLinkChallenge(token, userId)).toBe(false); expect(link?.lineUserId).toBeNull();
    updateError = Object.assign(new Error("PRIVATE_DEADLOCK"), { code: "ER_LOCK_DEADLOCK" });
    await expect(completeLineLinkChallenge(token, userId)).rejects.toThrow("PRIVATE_DEADLOCK");
    updateError = undefined; failAudit = true;
    await expect(completeLineLinkChallenge(token, userId)).rejects.toThrow("PRIVATE_AUDIT_FAILURE");
    expect(link?.lineUserId).toBeNull(); expect(link?.challengeHash).not.toBeNull(); expect(audits).toHaveLength(1);
  });

  it("rolls back issuance and removal when their audit insert fails", async () => {
    failAudit = true; await expect(issueLineLinkChallenge(actor, 7)).rejects.toThrow(); expect(link).toBeUndefined();
    failAudit = false; await issueLineLinkChallenge(actor, 7); const before = structuredClone(link);
    failAudit = true; await expect(removeLineLink(actor, 7)).rejects.toThrow(); expect(link).toEqual(before);
  });

  it("rejects invalid member IDs and ignores invalid provider input without any query", async () => {
    for (const id of [0, -1, NaN, 1.5]) await expect(getLineLinkStatus(actor, id)).rejects.toMatchObject({ status: 400 });
    expect(await completeLineLinkChallenge("not-a-token", userId)).toBe(false);
    expect(await completeLineLinkChallenge("a".repeat(43), "raw-id")).toBe(false);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
