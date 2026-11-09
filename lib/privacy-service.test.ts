import path from "path";
import { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { members, memberPackages, privacyRequests, consentEvents, privacyFileCleanups, auditLogs, memberLineLinks, notifications, notificationSettings } from "@/db/schema";
import { matches, queuedNotification } from "@/lib/notifications/notification-test-db";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), select: vi.fn(), insert: vi.fn(), update: vi.fn(), mkdir: vi.fn(), rename: vi.fn(), unlink: vi.fn(), writeFile: vi.fn(), stat: vi.fn(), deliver: vi.fn(), claim: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction, select: mocks.select, insert: mocks.insert, update: mocks.update } }));
vi.mock("fs/promises", () => ({ mkdir: mocks.mkdir, rename: mocks.rename, unlink: mocks.unlink, writeFile: mocks.writeFile, stat: mocks.stat }));
vi.mock("@/lib/staff-service", () => ({ AuthorizationError: class extends Error {} }));
vi.mock("@/lib/notifications/providers/delivery", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/notifications/providers/delivery")>(), deliverNotification: mocks.deliver }));
vi.mock("@/lib/notifications/line-delivery-policy", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/notifications/line-delivery-policy")>(), claimLineNotification: mocks.claim }));

import { appendConsentEvent, anonymizeApprovedRequest, retryPrivacyFileCleanup } from "@/lib/privacy-service";
import { saveMemberPhoto } from "@/lib/member-photo-service";
import { completeLineLinkChallenge, issueLineLinkChallenge } from "@/lib/line-link-service";
import { generateNotifications, processNotificationDelivery } from "@/lib/notification-engine";
import {
  executeAnonymizationPlan,
  type AnonymizationOperation,
} from "@/lib/privacy-anonymization";

/** ควบคุม interleaving ด้วย barrier แทนเวลารอ เพื่อให้ race regression ทำซ้ำได้แน่นอน */
function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

const actor = { staffId: 3, role: "OWNER" as const, homeBranchId: 10 };
const root = path.join(process.cwd(), "public", "uploads", "members");
const privateRoot = path.join(process.cwd(), "storage", "member-photos");
const files = new Map<string, Buffer>();
let member: { id: number; homeBranchId: number; photoUrl: string | null; status: string };
let requestRow: Record<string, unknown>;
let cleanup: Record<string, unknown> | undefined;
let events: { id: number; consentType: string; action: string; createdAt: Date }[];
let transactionTail: Promise<void>;
let memberLocked: boolean;
let activeTransaction: boolean;
let uploadHold: ReturnType<typeof barrier> | undefined;
let uploadEntered: ReturnType<typeof barrier>;
let privacyHold: ReturnType<typeof barrier> | undefined;
let privacyEntered: ReturnType<typeof barrier>;
let preliminaryRead: ReturnType<typeof barrier>;
let failMemberUpdate: boolean;
let loseCommitAcknowledgement: boolean;
let failFailureAudit: boolean;
let sharedReferences: { id: number; photoUrl: string }[];
let audits: Record<string, unknown>[];
let links: (typeof memberLineLinks.$inferSelect)[];
let failSuccessAudit: boolean;
let failLinkDelete: boolean;
let memberLockHold: ReturnType<typeof barrier> | undefined;
let memberLockEntered: ReturnType<typeof barrier>;
let transactionQueued: ReturnType<typeof barrier>;
let lockTraces: string[][];
let deletedMemberIds: unknown[];
let notificationRows: Record<string, unknown>[];
let beforeNotificationUpdate: (() => Promise<void>) | undefined;
let afterRead: ((table: unknown) => Promise<void>) | undefined;

/** จำลอง transaction/row lock และ filesystem เฉพาะในหน่วยความจำ โดยใช้ service และ consent snapshot จริง */
beforeEach(async () => {
  vi.resetAllMocks(); files.clear();
  mocks.claim.mockImplementation((await vi.importActual<typeof import("@/lib/notifications/line-delivery-policy")>("@/lib/notifications/line-delivery-policy")).claimLineNotification);
  member = { id: 7, homeBranchId: 10, photoUrl: "/uploads/members/old.jpg", status: "ACTIVE" };
  requestRow = { memberId: 7, branchId: 10, status: "APPROVED", requestedByStaffId: 1, reviewedByStaffId: 2 };
  cleanup = undefined; sharedReferences = []; audits = [];
  links = []; failSuccessAudit = false; failLinkDelete = false;
  memberLockHold = undefined; memberLockEntered = barrier(); transactionQueued = barrier(); lockTraces = [];
  deletedMemberIds = [];
  notificationRows = []; beforeNotificationUpdate = undefined; afterRead = undefined;
  mocks.deliver.mockResolvedValue({ outcome: "sent" });
  events = [{ id: 1, consentType: "PHOTO", action: "GRANTED", createdAt: new Date("2026-11-01") }];
  files.set(path.join(root, "old.jpg"), Buffer.from("old"));
  transactionTail = Promise.resolve(); memberLocked = false; activeTransaction = false;
  failMemberUpdate = false; loseCommitAcknowledgement = false; failFailureAudit = false;
  uploadHold = undefined; privacyHold = undefined;
  uploadEntered = barrier(); privacyEntered = barrier(); preliminaryRead = barrier();
  const select = (inTransaction: boolean) => () => {
    let table: unknown; let condition: unknown;
    const rows = () => {
      if (!inTransaction && (table === members || table === privacyRequests)) preliminaryRead.release();
      if (table === members) {
        const query = condition ? new MySqlDialect().sqlToQuery(condition as Parameters<MySqlDialect["sqlToQuery"]>[0]) : undefined;
        const parameters = query?.params ?? [];
        const urls = parameters.filter((value): value is string => typeof value === "string" && value.startsWith("/"));
        if (urls.length) return [...sharedReferences, ...(query?.sql.includes("<>") ? [] : [member])].filter((row) => urls.includes(row.photoUrl ?? ""));
        return [{ ...member }];
      }
      if (table === memberPackages) return member.status === "ACTIVE" ? [{ ...member, id: 12, memberId: 7, expireDate: "2026-11-10" }] : [];
      if (table === privacyRequests) return [{ ...requestRow, photoUrl: member.photoUrl, memberStatus: member.status }];
      if (table === memberLineLinks) {
        const params = new MySqlDialect().sqlToQuery(condition as Parameters<MySqlDialect["sqlToQuery"]>[0]).params;
        return links.filter((row) => params.includes(row.memberId) || params.includes(row.challengeHash)).map((row) => ({ ...row }));
      }
      if (table === consentEvents) {
        const query = condition ? new MySqlDialect().sqlToQuery(condition as Parameters<MySqlDialect["sqlToQuery"]>[0]) : undefined;
        const consentType = query?.params.find(value => ["SERVICE_PRIVACY", "MARKETING", "PHOTO"].includes(String(value)));
        const matching = events.filter(event => !consentType || event.consentType === consentType);
        return consentType ? matching.slice(-1) : matching.map(event => ({ ...event }));
      }
      if (table === privacyFileCleanups) return cleanup ? [{ ...cleanup }] : [];
      if (table === notifications) return notificationRows.filter(row => matches(condition as Parameters<MySqlDialect["sqlToQuery"]>[0], row, notifications, member)).map(row => ({ ...row }));
      if (table === notificationSettings) return [{ id: 1, isActive: true, enableLine: true, enableSms: true, enableEmail: true, reminderDays: "1", inactivityDays: 30 }];
      return [];
    };
    const query = {
      from(value: unknown) { table = value; return query; },
      where(value: unknown) { condition = value; return query; },
      innerJoin() { return query; }, limit() { return query; }, orderBy() { return query; }, groupBy() { return query; },
      async for() {
        lockTraces.at(-1)!.push(table === members ? "member" : table === privacyRequests ? "request" : table === memberLineLinks ? "link" : table === notifications ? "notification" : "consent");
        if (table === members) {
          memberLocked = true;
          const hold = memberLockHold; memberLockHold = undefined;
          memberLockEntered.release(); if (hold) await hold.promise;
        }
        return rows();
      },
      async then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        try { const snapshot = rows(); await afterRead?.(table); return resolve(snapshot); } catch (error) { return reject(error); }
      },
    };
    return query;
  };
  const insert = (table: unknown) => ({ ignore() { return this; }, values: async (value: Record<string, unknown> | Record<string, unknown>[]) => {
    if (table === notifications && Array.isArray(value)) {
      expect(activeTransaction && memberLocked).toBe(true);
      notificationRows.push(...value); return [{ affectedRows: value.length }];
    }
    if (table === auditLogs && !Array.isArray(value) && value.result === "FAILED" && failFailureAudit) throw new Error("PRIVATE_AUDIT_SQL");
    if (table === auditLogs && !Array.isArray(value) && value.result === "SUCCESS" && failSuccessAudit) throw new Error("SUCCESS_AUDIT_FAILED");
    if (table === auditLogs && !Array.isArray(value)) audits.push(value);
    if (table === consentEvents) for (const event of Array.isArray(value) ? value : [value]) events.push({ id: events.length + 1, consentType: String(event.consentType), action: String(event.action), createdAt: new Date("2026-11-07") });
    if (table === privacyFileCleanups) cleanup = { ...(value as Record<string, unknown>), id: 5 };
    if (table === memberLineLinks) links.push({ ...value } as typeof memberLineLinks.$inferSelect);
    return [{ insertId: 5 }];
  } });
  const update = (table: unknown) => ({ set: (changes: Record<string, unknown>) => ({ where: async (condition: Parameters<MySqlDialect["sqlToQuery"]>[0]) => {
    if (table === notifications) {
      await beforeNotificationUpdate?.();
      const matching = notificationRows.filter(row => matches(condition, row, notifications, member));
      for (const row of matching) for (const [key, value] of Object.entries(changes)) row[key] = value instanceof SQL ? Number(row[key]) + 1 : value;
      return [{ affectedRows: matching.length }];
    }
    if (table === members && failMemberUpdate) { failMemberUpdate = false; throw new Error("MEMBER_UPDATE_FAILED"); }
    if (table === members) Object.assign(member, changes);
    if (table === privacyRequests) Object.assign(requestRow, changes);
    if (table === privacyFileCleanups && cleanup) Object.assign(cleanup, changes);
    if (table === memberLineLinks) Object.assign(links.find((row) => row.memberId === member.id)!, changes);
    return [{ affectedRows: 1 }];
  } }) });
  const remove = (table: unknown) => ({ where: async (condition: Parameters<MySqlDialect["sqlToQuery"]>[0]) => {
    if (!activeTransaction || !memberLocked || table !== memberLineLinks) throw new Error("LINE_DELETE_WITHOUT_MEMBER_LOCK");
    if (failLinkDelete) throw new Error("LINE_DELETE_FAILED");
    const query = new MySqlDialect().sqlToQuery(condition);
    expect(query.sql).toBe("`member_line_links`.`member_id` = ?");
    deletedMemberIds.push(...query.params);
    links = links.filter((row) => !query.params.includes(row.memberId));
    return [{ affectedRows: 1 }];
  } });
  mocks.select.mockImplementation(select(false)); mocks.insert.mockImplementation(insert); mocks.update.mockImplementation(update);
  mocks.transaction.mockImplementation(async (callback) => {
    const prior = transactionTail; const gate = barrier(); transactionTail = gate.promise;
    transactionQueued.release();
    await prior; activeTransaction = true; memberLocked = false;
    lockTraces.push([]);
    const before = structuredClone({ member, request: requestRow, events, links, audits, cleanup, notificationRows });
    let committed = false;
    try {
      const value = await callback({ select: select(true), insert, update, delete: remove });
      committed = true;
      if (loseCommitAcknowledgement) { loseCommitAcknowledgement = false; throw new Error("COMMIT_ACK_LOST"); }
      return value;
    } catch (error) {
      if (!committed) { member = before.member; requestRow = before.request; events = before.events; links = before.links; audits = before.audits; cleanup = before.cleanup; notificationRows = before.notificationRows; }
      throw error;
    }
    finally { activeTransaction = false; memberLocked = false; gate.release(); }
  });
  mocks.mkdir.mockImplementation(async (directory: string) => { if (directory === privateRoot && uploadHold) { uploadEntered.release(); await uploadHold.promise; } });
  mocks.stat.mockImplementation(async (filePath: string) => {
    if (!files.has(filePath)) throw Object.assign(new Error("PRIVATE_PATH"), { code: "ENOENT" });
    return { isFile: () => true };
  });
  mocks.writeFile.mockImplementation(async (filePath: string, bytes: Buffer) => { files.set(filePath, bytes); });
  mocks.rename.mockImplementation(async (source: string, target: string) => {
    if (!activeTransaction || !memberLocked) throw new Error("PHOTO_MOVE_WITHOUT_MEMBER_LOCK");
    if (!files.has(source)) throw new Error("PHOTO_SOURCE_MISSING");
    files.set(target, files.get(source)!); files.delete(source);
    privacyEntered.release(); if (privacyHold) await privacyHold.promise;
  });
  mocks.unlink.mockImplementation(async (filePath: string) => { files.delete(filePath); });
});

/** เรียก privacy mutation จริงตามกรณี โดยคง event ledger และแผน anonymization จริงทั้งหมด */
function removePhoto(kind: string) {
  return kind === "withdrawal" ? appendConsentEvent({ memberId: 7, consentType: "PHOTO", action: "WITHDRAWN", policyVersion: "2026-11" }, actor) : anonymizeApprovedRequest(1, actor);
}

/** สร้าง upload ที่ถูกต้องเพื่อให้ race เดินถึงจุดล็อก/เขียนจริงโดยไม่ใช้ storage จริง */
function uploadPhoto() {
  return saveMemberPhoto({ actor, branchId: 10, memberId: 7, file: new File([Buffer.from("89504e470d0a1a0a", "hex")], "photo.png", { type: "image/png" }) });
}

describe("photo/privacy serialization", () => {
  it.each(["withdrawal", "anonymization"])("%s cleans the newly committed photo when upload obtains the lock first", async (kind) => {
    uploadHold = barrier();
    const upload = uploadPhoto(); await uploadEntered.promise;
    const removal = removePhoto(kind);
    // จับ rejection ทันที เพื่อให้ RED ของ implementation เดิมไม่กลายเป็น unhandled rejection
    const outcome = removal.then(() => null, (error: unknown) => error);
    await preliminaryRead.promise; uploadHold.release();
    await upload;
    expect(await outcome).toBeNull();
    expect(member.photoUrl).toBeNull();
    expect([...files.keys()].filter((filePath) => [root, privateRoot].includes(path.dirname(filePath)))).toEqual([]);
  });

  it.each(["withdrawal", "anonymization"])("upload cannot recreate a public photo when %s obtains the lock first", async (kind) => {
    privacyHold = barrier();
    const removal = removePhoto(kind);
    const outcome = removal.then(() => null, (error: unknown) => error);
    // implementation เดิมย้ายไฟล์ก่อนล็อกและจึง reject ก่อนเข้า barrier
    await Promise.race([privacyEntered.promise, outcome]);
    expect(activeTransaction).toBe(true);
    const upload = uploadPhoto().then(() => null, (error: unknown) => error);
    privacyHold.release(); await removal;
    expect(await upload).toMatchObject({ status: kind === "withdrawal" ? 403 : 404 });
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(member.photoUrl).toBeNull();
    expect([...files.keys()].filter((filePath) => path.dirname(filePath) === root)).toEqual([]);
  });

  it.each(["withdrawal", "anonymization"])("%s restores a moved photo under the lock only after a verified rollback", async (kind) => {
    failMemberUpdate = true;
    await expect(removePhoto(kind)).rejects.toThrow("MEMBER_UPDATE_FAILED");
    expect(member.photoUrl).toBe("/uploads/members/old.jpg");
    expect(files.get(path.join(root, "old.jpg"))).toEqual(Buffer.from("old"));
    expect(mocks.rename).toHaveBeenCalledTimes(2);
  });

  it.each(["withdrawal", "anonymization"])("%s never restores a public photo after successful commit with lost acknowledgement", async (kind) => {
    loseCommitAcknowledgement = true;
    await expect(removePhoto(kind)).rejects.toThrow("COMMIT_ACK_LOST");
    expect(member.photoUrl).toBeNull();
    expect([...files.keys()].filter((filePath) => path.dirname(filePath) === root)).toEqual([]);
    expect(mocks.rename).toHaveBeenCalledTimes(1);
  });

  it("does not expose raw failure-audit errors while handling anonymization rollback", async () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    failMemberUpdate = true; failFailureAudit = true;
    await expect(removePhoto("anonymization")).rejects.toThrow("MEMBER_UPDATE_FAILED");
    expect(logger).toHaveBeenCalledExactlyOnceWith("PRIVACY_FAILURE_AUDIT_FAILED");
    logger.mockRestore();
  });
});

describe("private photo lifecycle", () => {
  it.each(["withdrawal", "anonymization"])("%s moves the exact legacy source into private quarantine", async (kind) => {
    await removePhoto(kind);
    expect(mocks.rename.mock.calls[0][0]).toBe(path.join(root, "old.jpg"));
    expect(path.dirname(mocks.rename.mock.calls[0][1])).toBe(path.join(process.cwd(), "storage", "privacy-cleanup"));
  });

  it.each(["withdrawal", "anonymization"])("%s restores the private source, not a public alias, after rollback", async (kind) => {
    member.photoUrl = `/member-photos/${"a".repeat(64)}.png`;
    files.clear(); const source = path.join(privateRoot, `${"a".repeat(64)}.png`);
    files.set(source, Buffer.from("private")); failMemberUpdate = true;
    await expect(removePhoto(kind)).rejects.toThrow("MEMBER_UPDATE_FAILED");
    expect(files.get(source)).toEqual(Buffer.from("private"));
    expect(mocks.rename.mock.calls[1][1]).toBe(source);
  });

  it.each(["withdrawal", "anonymization"])("%s rejects shared aliases before moving or mutating data", async (kind) => {
    const name = `${"a".repeat(64)}.png`;
    member.photoUrl = `/uploads/members/${name}`;
    files.clear(); files.set(path.join(root, name), Buffer.from("old"));
    sharedReferences = [{ id: 8, photoUrl: `/member-photos/${name}` }];
    await expect(removePhoto(kind)).rejects.toMatchObject({ status: 409 });
    expect(mocks.rename).not.toHaveBeenCalled();
    expect(events).toHaveLength(1); expect(member.status).toBe("ACTIVE");
    expect(member.photoUrl).toBe(`/uploads/members/${name}`); expect(cleanup).toBeUndefined();
  });

  it.each(["withdrawal", "anonymization"])("%s rejects duplicate source copies before mutation", async (kind) => {
    files.set(path.join(privateRoot, "old.jpg"), Buffer.from("duplicate"));
    await expect(removePhoto(kind)).rejects.toMatchObject({ status: 409 });
    expect(mocks.rename).not.toHaveBeenCalled(); expect(events).toHaveLength(1);
    expect(member.photoUrl).toBe("/uploads/members/old.jpg"); expect(cleanup).toBeUndefined();
  });

  it.each(["withdrawal", "anonymization"])("%s fails EXDEV before data/ledger mutation without copying", async (kind) => {
    mocks.rename.mockRejectedValue(Object.assign(new Error("PRIVATE_PATH"), { code: "EXDEV" }));
    await expect(removePhoto(kind)).rejects.toMatchObject({ status: 409 });
    expect(files.get(path.join(root, "old.jpg"))).toEqual(Buffer.from("old"));
    expect(events).toHaveLength(1); expect(member.status).toBe("ACTIVE");
    expect(member.photoUrl).toBe("/uploads/members/old.jpg"); expect(cleanup).toBeUndefined();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("preserves failed-move cleanup tracking for non-EXDEV anonymization errors", async () => {
    mocks.rename.mockRejectedValue(Object.assign(new Error("PRIVATE_PATH"), { code: "EACCES" }));
    await expect(removePhoto("anonymization")).rejects.toMatchObject({ status: 409 });
    expect(events).toHaveLength(1); expect(member.photoUrl).toBe("/uploads/members/old.jpg");
    expect(cleanup).toMatchObject({ source: "ANONYMIZATION", status: "FAILED", errorCode: "FILE_MOVE_FAILED" });
    expect(requestRow).toMatchObject({ status: "APPROVED", fileCleanupStatus: "FAILED", fileCleanupError: "FILE_MOVE_FAILED" });
  });

  it.each(["missing", "stat access failure"])("tracks ordinary %s source failure without mutating member or consent", async (failure) => {
    if (failure === "missing") files.clear();
    else mocks.stat.mockRejectedValue(Object.assign(new Error("PRIVATE_PATH"), { code: "EACCES" }));
    await expect(removePhoto("anonymization")).rejects.toMatchObject({ status: 409 });
    expect(events).toHaveLength(1); expect(member.photoUrl).toBe("/uploads/members/old.jpg");
    expect(member.status).toBe("ACTIVE"); expect(mocks.rename).not.toHaveBeenCalled();
    expect(cleanup).toMatchObject({ source: "ANONYMIZATION", status: "FAILED", errorCode: "FILE_MOVE_FAILED" });
    expect(cleanup?.quarantineToken).toMatch(/^[a-f0-9]{64}$/);
    expect(requestRow).toMatchObject({ status: "APPROVED", fileCleanupStatus: "FAILED", fileCleanupError: "FILE_MOVE_FAILED" });
    expect(audits).toContainEqual(expect.objectContaining({ result: "FAILED", metadata: { errorCode: "FILE_MOVE_FAILED" } }));
  });

  it.each(["private", "legacy", "both", "missing"])("cleanup removes %s quarantine candidates before completion", async (source) => {
    const token = "b".repeat(64);
    member.status = "CANCELLED"; member.photoUrl = null;
    requestRow.fileCleanupStatus = "FAILED"; requestRow.fileCleanupError = "FILE_DELETE_FAILED";
    cleanup = { id: 5, quarantineToken: token };
    const candidates = [path.join(process.cwd(), "storage", "privacy-cleanup", token), path.join(process.cwd(), "public", "uploads", "privacy-cleanup", token)];
    if (source === "private" || source === "both") files.set(candidates[0], Buffer.from("private"));
    if (source === "legacy" || source === "both") files.set(candidates[1], Buffer.from("legacy"));
    mocks.unlink.mockImplementation(async (filePath: string) => {
      if (!files.delete(filePath)) throw Object.assign(new Error("PRIVATE_PATH"), { code: "ENOENT" });
    });
    await retryPrivacyFileCleanup(1, actor);
    expect(candidates.some((candidate) => files.has(candidate))).toBe(false);
    expect(requestRow.status).toBe("COMPLETED");
    expect(cleanup.status).toBe("COMPLETED");
  });

  it("never completes partially failed dual-root cleanup and can retry it", async () => {
    const token = "b".repeat(64);
    member.status = "CANCELLED"; member.photoUrl = null;
    requestRow.fileCleanupStatus = "FAILED"; requestRow.fileCleanupError = "FILE_DELETE_FAILED";
    cleanup = { id: 5, quarantineToken: token };
    const privateFile = path.join(process.cwd(), "storage", "privacy-cleanup", token);
    const publicFile = path.join(process.cwd(), "public", "uploads", "privacy-cleanup", token);
    files.set(privateFile, Buffer.from("private")); files.set(publicFile, Buffer.from("legacy"));
    mocks.unlink.mockImplementation(async (filePath: string) => {
      if (filePath === publicFile) throw Object.assign(new Error("PRIVATE_PATH"), { code: "EACCES" });
      files.delete(filePath);
    });
    await expect(retryPrivacyFileCleanup(1, actor)).rejects.toMatchObject({ status: 409 });
    expect(requestRow.status).toBe("APPROVED"); expect(cleanup.status).toBe("FAILED");
    expect(files.has(publicFile)).toBe(true);
    mocks.unlink.mockImplementation(async (filePath: string) => {
      if (!files.delete(filePath)) throw Object.assign(new Error("PRIVATE_PATH"), { code: "ENOENT" });
    });
    await retryPrivacyFileCleanup(1, actor);
    expect(files.has(publicFile)).toBe(false); expect(requestRow.status).toBe("COMPLETED");
  });

  it("rejects an unsafe cleanup token without touching filesystem", async () => {
    member.status = "CANCELLED";
    requestRow.fileCleanupStatus = "FAILED"; requestRow.fileCleanupError = "FILE_DELETE_FAILED";
    cleanup = { id: 5, quarantineToken: "../secret" };
    await expect(retryPrivacyFileCleanup(1, actor)).rejects.toMatchObject({ status: 409 });
    expect(mocks.unlink).not.toHaveBeenCalled(); expect(requestRow.status).toBe("APPROVED");
  });
});

/** ถอน SERVICE_PRIVACY หรือ anonymize โดยใช้ transaction จริงของ service แทนจำลองผล privacy เอง */
function removeLineData(kind: string) {
  return kind === "withdrawal" ? appendConsentEvent({ memberId: 7, consentType: "SERVICE_PRIVACY", action: "WITHDRAWN", policyVersion: "2026-11" }, actor) : anonymizeApprovedRequest(1, actor);
}

describe("LINE/privacy serialization", () => {
  beforeEach(() => {
    member.photoUrl = null;
    events.push({ id: 2, consentType: "SERVICE_PRIVACY", action: "GRANTED", createdAt: new Date("2026-11-02") });
  });

  it.each(["withdrawal", "anonymization"])("%s deletes pending, expired and linked data only for the target member", async (kind) => {
    for (const state of ["pending", "expired", "linked", "absent"]) {
      const issued = await issueLineLinkChallenge(actor, 7);
      const other = { ...links[0], memberId: 8, challengeHash: "b".repeat(64) };
      links.push(other);
      if (state === "linked") expect(await completeLineLinkChallenge(issued.command.slice(5), `U${"a".repeat(32)}`)).toBe(true);
      if (state === "expired") links[0].challengeExpiresAt = new Date(0);
      if (state === "absent") links = [other];
      await removeLineData(kind);
      expect(links).toEqual([other]);
      expect(member.status).toBe(kind === "withdrawal" ? "SUSPENDED" : "CANCELLED");
      expect(events.at(-1)).toMatchObject({ action: "WITHDRAWN" });
      expect(requestRow.status).toBe(kind === "withdrawal" ? "APPROVED" : "COMPLETED");
      const prefix = kind === "withdrawal" ? ["member"] : ["request", "member"];
      expect(lockTraces.map(trace => trace.slice(0, prefix.length))).toContainEqual(prefix);
      // ตั้ง fixture รอบถัดไปโดยไม่เปลี่ยน ledger ที่เพิ่งตรวจว่า append สำเร็จ
      member.status = "ACTIVE"; requestRow.status = "APPROVED"; links = [];
      events.push({ id: events.length + 1, consentType: "SERVICE_PRIVACY", action: "GRANTED", createdAt: new Date() });
    }
  });

  it.each(["withdrawal", "anonymization"])("%s rolls back deleted pending/linked data and consent when the success audit fails", async (kind) => {
    for (const state of ["pending", "linked"]) {
      const issued = await issueLineLinkChallenge(actor, 7);
      if (state === "linked") await completeLineLinkChallenge(issued.command.slice(5), `U${"a".repeat(32)}`);
      const before = structuredClone({ links, member, events, requestRow });
      failSuccessAudit = true;
      await expect(removeLineData(kind)).rejects.toThrow("SUCCESS_AUDIT_FAILED");
      expect({ links, member, events, requestRow }).toEqual(before);
      expect(deletedMemberIds).toEqual([7]);
      expect(audits.at(-1)).toMatchObject({ result: "FAILED" });
      failSuccessAudit = false; links = []; deletedMemberIds = [];
    }
  });

  it.each(["withdrawal", "anonymization"])("%s rolls back consent/member state when LINE deletion fails", async (kind) => {
    await issueLineLinkChallenge(actor, 7);
    const before = structuredClone({ links, member, events, requestRow });
    failLinkDelete = true;
    await expect(removeLineData(kind)).rejects.toThrow("LINE_DELETE_FAILED");
    expect({ links, member, events, requestRow }).toEqual(before);
  });

  it.each(["withdrawal", "anonymization"])("%s removes a completion that acquires the member lock first", async (kind) => {
    const issued = await issueLineLinkChallenge(actor, 7);
    const hold = barrier(); memberLockHold = hold; memberLockEntered = barrier();
    const completion = completeLineLinkChallenge(issued.command.slice(5), `U${"a".repeat(32)}`);
    await memberLockEntered.promise; transactionQueued = barrier();
    const removal = removeLineData(kind); await transactionQueued.promise;
    hold.release();
    expect(await completion).toBe(true); await removal;
    expect(links).toEqual([]);
    expect(audits.filter((row) => row.action === "LINE_LINK_COMPLETED")).toHaveLength(1);
  });

  it.each(["withdrawal", "anonymization"])("completion cannot recreate LINE data when %s acquires the member lock first", async (kind) => {
    const issued = await issueLineLinkChallenge(actor, 7);
    const hold = barrier(); memberLockHold = hold; memberLockEntered = barrier();
    const removal = removeLineData(kind);
    await memberLockEntered.promise; transactionQueued = barrier();
    const completion = completeLineLinkChallenge(issued.command.slice(5), `U${"a".repeat(32)}`);
    await transactionQueued.promise; hold.release(); await removal;
    expect(await completion).toBe(false);
    expect(links).toEqual([]);
    expect(audits.filter((row) => row.action === "LINE_LINK_COMPLETED")).toEqual([]);
  });

  it.each(["MARKETING", "PHOTO", "SERVICE_PRIVACY"] as const)("does not delete LINE data on %s grants or unrelated withdrawals", async (consentType) => {
    await issueLineLinkChallenge(actor, 7);
    const before = structuredClone(links);
    for (const action of consentType === "SERVICE_PRIVACY" ? ["GRANTED"] as const : ["GRANTED", "WITHDRAWN"] as const) {
      await appendConsentEvent({ memberId: 7, consentType, action, policyVersion: "2026-11" }, actor);
      expect(links).toEqual(before);
    }
  });
});

describe("notification/privacy cancellation", () => {
  beforeEach(() => {
    member.photoUrl = null;
    events.push({ id: 2, consentType: "SERVICE_PRIVACY", action: "GRANTED", createdAt: new Date("2026-11-02") });
  });

  it.each(["SERVICE_PRIVACY", "MARKETING"] as const)("%s withdrawal permanently cancels only its LINE scope and never revives on grant", async consentType => {
    await issueLineLinkChallenge(actor, 7);
    const previousLinks = structuredClone(links);
    notificationRows = [
      ...["QUEUED", "PROCESSING", "FAILED", "SKIPPED"].flatMap(status => ["INACTIVITY", "EXPIRY_REMINDER"].map(type => queuedNotification({ id: 0, status, type, failureKind: status === "SKIPPED" ? "CONFIG" : null }))),
      queuedNotification({ status: "SENT", sentAt: new Date(0) }),
      queuedNotification({ channel: "SMS" }), queuedNotification({ channel: "EMAIL" }), queuedNotification({ memberId: 8 }),
    ].map((row, index) => ({ ...row, id: index + 1 }));
    const before = structuredClone(notificationRows);
    await appendConsentEvent({ memberId: 7, consentType, action: "WITHDRAWN", policyVersion: "2026-11" }, actor);
    for (const [index, row] of notificationRows.entries()) {
      if (index < 8 && (consentType === "SERVICE_PRIVACY" || row.type === "INACTIVITY"))
        expect(row).toMatchObject({ status: "SKIPPED", failureKind: "PERMANENT", recipient: null, sentAt: null });
      else expect(row).toEqual(before[index]);
    }
    expect(links).toEqual(consentType === "SERVICE_PRIVACY" ? [] : previousLinks);
    expect(audits.filter(row => row.action === "LINE_NOTIFICATIONS_CANCELLED")).toEqual([expect.objectContaining({ branchId: null, metadata: { source: "LINE_DELIVERY", errorCode: `${consentType}_WITHDRAWN`, count: consentType === "SERVICE_PRIVACY" ? 8 : 4 } })]);
    const cancelled = structuredClone(notificationRows);
    await appendConsentEvent({ memberId: 7, consentType, action: "GRANTED", policyVersion: "2026-11" }, actor);
    const issued = await issueLineLinkChallenge(actor, 7);
    expect(await completeLineLinkChallenge(issued.command.slice(5), `U${"b".repeat(32)}`)).toBe(true);
    expect(notificationRows).toEqual(cancelled);
  });

  it.each(["PHOTO", "MARKETING", "SERVICE_PRIVACY"] as const)("%s grants and PHOTO withdrawal leave notifications untouched", async consentType => {
    notificationRows = [queuedNotification()];
    const before = structuredClone(notificationRows);
    for (const action of consentType === "PHOTO" ? ["GRANTED", "WITHDRAWN"] as const : ["GRANTED"] as const)
      await appendConsentEvent({ memberId: 7, consentType, action, policyVersion: "2026-11" }, actor);
    expect(notificationRows).toEqual(before);
  });

  it("anonymization scrubs every channel, terminalizes unsent history and preserves SENT", async () => {
    notificationRows = ["LINE", "SMS", "EMAIL", "IN_APP"].flatMap(channel => ["QUEUED", "PROCESSING", "FAILED", "SKIPPED", "SENT"].map(status => queuedNotification({ channel, status, errorMessage: "private error", sentAt: status === "SENT" ? new Date(0) : null }))).map((row, index) => ({ ...row, id: index + 1 }));
    const other = queuedNotification({ id: 99, memberId: 8 }); notificationRows.push(other);
    await anonymizeApprovedRequest(1, actor);
    for (const [index, row] of notificationRows.slice(0, -1).entries()) {
      expect(row).toMatchObject({ recipient: null, title: "ANONYMIZED", message: "ANONYMIZED", errorMessage: null });
      expect(row).toMatchObject(index % 5 === 4 ? { status: "SENT", sentAt: new Date(0) } : { status: "SKIPPED", failureKind: "PERMANENT", sentAt: null });
    }
    expect(notificationRows.at(-1)).toEqual(other);
    expect(lockTraces[0].slice(0, 2)).toEqual(["request", "member"]);
  });

  it("does not insert stale SMS/email PII after anonymization commits during generation", async () => {
    Object.assign(member, { firstName: "Old", lastName: "Name", phone: "0800000000", email: "old@example.test" });
    const snapshotReady = barrier(); const resume = barrier();
    afterRead = async table => {
      if (table !== memberPackages) return;
      afterRead = undefined; snapshotReady.release(); await resume.promise;
    };
    const generation = generateNotifications(10, new Date(2026, 10, 9));
    await snapshotReady.promise;
    await anonymizeApprovedRequest(1, actor);
    expect(member.status).toBe("CANCELLED");
    resume.release(); const result = await generation;
    expect(notificationRows).toEqual([]);
    expect(result).toMatchObject({ candidates: 2, created: 0 });
  });

  it("generates and dedupes ordinary reminders without generating LINE", async () => {
    Object.assign(member, { firstName: "Current", lastName: "Name", phone: "0800000001", email: "current@example.test" });
    const now = new Date(2026, 10, 9);
    expect(await generateNotifications(10, now)).toMatchObject({ candidates: 2, created: 2 });
    expect(await generateNotifications(10, now)).toMatchObject({ candidates: 2, created: 0 });
    expect(notificationRows.map(row => [row.channel, row.recipient, row.status])).toEqual([
      ["SMS", "0800000001", "QUEUED"], ["EMAIL", "current@example.test", "QUEUED"],
    ]);
  });

  it.each(["SERVICE_PRIVACY", "MARKETING", "ANONYMIZATION"])("%s rolls back notification changes with the failed audit", async kind => {
    notificationRows = [queuedNotification(), queuedNotification({ id: 2, channel: "SMS" })];
    const before = structuredClone({ notificationRows, member, events, links, requestRow });
    failSuccessAudit = true;
    await expect(kind === "ANONYMIZATION" ? anonymizeApprovedRequest(1, actor) : appendConsentEvent({ memberId: 7, consentType: kind as "SERVICE_PRIVACY" | "MARKETING", action: "WITHDRAWN", policyVersion: "2026-11" }, actor)).rejects.toThrow("SUCCESS_AUDIT_FAILED");
    expect({ notificationRows, member, events, links, requestRow }).toEqual(before);
  });

  it.each(["SERVICE_PRIVACY", "MARKETING"] as const)("%s withdrawal before preflight causes zero provider calls", async consentType => {
    notificationRows = [queuedNotification()];
    await appendConsentEvent({ memberId: 7, consentType, action: "WITHDRAWN", policyVersion: "2026-11" }, actor);
    await expect(processNotificationDelivery(1, 10)).rejects.toMatchObject({ status: 409 });
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it.each(["SERVICE_PRIVACY", "MARKETING"] as const)("%s withdrawal after LINE claim blocks only calls not yet authorized and fences late acknowledgement", async consentType => {
    const realClaim = (await vi.importActual<typeof import("@/lib/notifications/line-delivery-policy")>("@/lib/notifications/line-delivery-policy")).claimLineNotification;
    // จำลองเฉพาะ gate input เพื่อทดสอบ in-flight path โดยไม่เปิด outbound จริงและใช้ provider fake เท่านั้น
    mocks.claim.mockImplementation(async (id: number, memberId: number, branchId: number, enabled: boolean) => {
      expect(enabled).toBe(false);
      return realClaim(id, memberId, branchId, true);
    });
    for (const timing of ["before final read", "after final read", "in flight"]) {
      events.push({ id: events.length + 1, consentType: "SERVICE_PRIVACY", action: "GRANTED", createdAt: new Date() });
      events.push({ id: events.length + 1, consentType: "MARKETING", action: "GRANTED", createdAt: new Date() });
      if (!links[0]?.lineUserId) {
        const issued = await issueLineLinkChallenge(actor, 7);
        expect(await completeLineLinkChallenge(issued.command.slice(5), `U${"a".repeat(32)}`)).toBe(true);
      }
      notificationRows = [queuedNotification()];
      const withdraw = () => appendConsentEvent({ memberId: 7, consentType, action: "WITHDRAWN", policyVersion: "2026-11" }, actor);
      mocks.deliver.mockClear();
      if (timing === "before final read") mocks.claim.mockImplementationOnce(async (id: number, memberId: number, branchId: number) => {
        const claimed = await realClaim(id, memberId, branchId, true);
        await withdraw(); return claimed;
      });
      else if (timing === "after final read") {
        // พักหลังอ่าน snapshot ของ claim ที่ commit แล้ว ให้ถอนสิทธิ์จนเสร็จก่อน adapter เริ่ม
        afterRead = async table => {
          if (table !== notifications || activeTransaction || notificationRows[0].status !== "PROCESSING") return;
          afterRead = undefined; expect(mocks.deliver).not.toHaveBeenCalled(); await withdraw();
        };
        mocks.deliver.mockImplementationOnce(async () => {
          expect(activeTransaction).toBe(false);
          expect(notificationRows[0]).toMatchObject({ status: "SKIPPED", failureKind: "PERMANENT", recipient: null });
          return { outcome: "sent" };
        });
      }
      else mocks.deliver.mockImplementationOnce(async () => {
        expect(activeTransaction).toBe(false); await withdraw(); return { outcome: "sent" };
      });
      await expect(processNotificationDelivery(1, 10)).rejects.toMatchObject({ status: 409 });
      expect(mocks.deliver).toHaveBeenCalledTimes(timing === "before final read" ? 0 : 1);
      expect(notificationRows[0]).toMatchObject({ status: "SKIPPED", failureKind: "PERMANENT", recipient: null, sentAt: null, attemptCount: 1 });
    }
  });

  it.each(["SMS", "EMAIL"])("anonymization blocks a loaded %s snapshot before claim", async channel => {
    notificationRows = [queuedNotification({ channel })];
    beforeNotificationUpdate = async () => { beforeNotificationUpdate = undefined; await anonymizeApprovedRequest(1, actor); };
    await expect(processNotificationDelivery(1, 10)).rejects.toMatchObject({ status: 409 });
    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(notificationRows[0]).toMatchObject({ status: "SKIPPED", recipient: null, failureKind: "PERMANENT", attemptCount: 0 });
  });

  it.each(["SMS", "EMAIL"])("late %s acknowledgement cannot revive anonymized notification", async channel => {
    notificationRows = [queuedNotification({ channel })];
    mocks.deliver.mockImplementation(async () => {
      expect(activeTransaction).toBe(false);
      await anonymizeApprovedRequest(1, actor);
      return { outcome: "sent" };
    });
    await expect(processNotificationDelivery(1, 10)).rejects.toMatchObject({ status: 409 });
    expect(notificationRows[0]).toMatchObject({ status: "SKIPPED", recipient: null, title: "ANONYMIZED", message: "ANONYMIZED", errorMessage: null, sentAt: null });
  });
});

describe("anonymization transaction plan", () => {
  it("ครอบคลุมทุกตารางที่มี PII และไม่แก้ไขข้อมูลบัญชีที่ต้องเก็บรักษา", async () => {
    const recorded: AnonymizationOperation[] = [];

    await executeAnonymizationPlan({
      async execute(operation) {
        recorded.push(operation);
      },
    });

    const tables: string[] = recorded.map((operation) => operation.table);
    expect(tables).toEqual([
      "member_line_links",
      "members",
      "card_pool",
      "access_logs",
      "member_crm_profiles",
      "crm_interactions",
      "notifications",
      "loyalty_points",
      "pt_packages",
      "pt_sessions",
      "payments",
      "receipts",
      "freeze_records",
      "member_access_tokens",
      "member_accounts",
      "member_sessions",
      "member_applications",
      "locker_rentals",
      "consent_events",
      "privacy_requests",
      "privacy_file_cleanups",
      "audit_logs",
    ]);
    expect(recorded[0]).toEqual({ table: "member_line_links", action: "DELETE", fields: [] });

    const paymentFields = recorded.find(
      (operation) => operation.table === "payments",
    )?.fields;
    expect(paymentFields).toEqual(["note"]);
    expect(
      recorded.find((operation) => operation.table === "receipts")?.fields,
    ).toEqual(["buyerName", "buyerTaxId", "buyerAddress"]);
    expect(tables).not.toContain("member_packages");
    expect(recorded.flatMap((operation) => operation.fields)).not.toEqual(
      expect.arrayContaining([
        "amount",
        "method",
        "receiptNumber",
        "startDate",
        "expireDate",
      ]),
    );
  });
});
