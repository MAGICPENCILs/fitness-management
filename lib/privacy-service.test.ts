import path from "path";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { members, privacyRequests, consentEvents, privacyFileCleanups, auditLogs } from "@/db/schema";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), select: vi.fn(), insert: vi.fn(), update: vi.fn(), mkdir: vi.fn(), rename: vi.fn(), unlink: vi.fn(), writeFile: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction, select: mocks.select, insert: mocks.insert, update: mocks.update } }));
vi.mock("fs/promises", () => ({ mkdir: mocks.mkdir, rename: mocks.rename, unlink: mocks.unlink, writeFile: mocks.writeFile }));
vi.mock("@/lib/staff-service", () => ({ AuthorizationError: class extends Error {} }));

import { appendConsentEvent, anonymizeApprovedRequest } from "@/lib/privacy-service";
import { saveMemberPhoto } from "@/lib/member-photo-service";
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

/** จำลอง transaction/row lock และ filesystem เฉพาะในหน่วยความจำ โดยใช้ service และ consent snapshot จริง */
beforeEach(() => {
  vi.resetAllMocks(); files.clear();
  member = { id: 7, homeBranchId: 10, photoUrl: "/uploads/members/old.jpg", status: "ACTIVE" };
  requestRow = { memberId: 7, branchId: 10, status: "APPROVED", requestedByStaffId: 1, reviewedByStaffId: 2 };
  cleanup = undefined;
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
        const parameters = condition ? new MySqlDialect().sqlToQuery(condition as Parameters<MySqlDialect["sqlToQuery"]>[0]).params : [];
        const urls = parameters.filter((value): value is string => typeof value === "string" && value.startsWith("/"));
        return urls.length && !urls.includes(member.photoUrl ?? "") ? [] : [{ ...member }];
      }
      if (table === privacyRequests) return [{ ...requestRow, photoUrl: member.photoUrl, memberStatus: member.status }];
      if (table === consentEvents) return events.map((event) => ({ ...event }));
      if (table === privacyFileCleanups) return cleanup ? [{ ...cleanup }] : [];
      return [];
    };
    const query = {
      from(value: unknown) { table = value; return query; },
      where(value: unknown) { condition = value; return query; },
      innerJoin() { return query; }, limit() { return query; }, orderBy() { return query; },
      async for() { if (table === members) memberLocked = true; return rows(); },
      then(resolve: (value: unknown[]) => unknown) { return Promise.resolve(rows()).then(resolve); },
    };
    return query;
  };
  const insert = (table: unknown) => ({ values: async (value: Record<string, unknown> | Record<string, unknown>[]) => {
    if (table === auditLogs && !Array.isArray(value) && value.result === "FAILED" && failFailureAudit) throw new Error("PRIVATE_AUDIT_SQL");
    if (table === consentEvents) for (const event of Array.isArray(value) ? value : [value]) events.push({ id: events.length + 1, consentType: String(event.consentType), action: String(event.action), createdAt: new Date("2026-11-07") });
    if (table === privacyFileCleanups) cleanup = { ...(value as Record<string, unknown>), id: 5 };
    return [{ insertId: 5 }];
  } });
  const update = (table: unknown) => ({ set: (changes: Record<string, unknown>) => ({ where: async () => {
    if (table === members && failMemberUpdate) { failMemberUpdate = false; throw new Error("MEMBER_UPDATE_FAILED"); }
    if (table === members) Object.assign(member, changes);
    if (table === privacyRequests) Object.assign(requestRow, changes);
    return [{ affectedRows: 1 }];
  } }) });
  mocks.select.mockImplementation(select(false)); mocks.insert.mockImplementation(insert); mocks.update.mockImplementation(update);
  mocks.transaction.mockImplementation(async (callback) => {
    const prior = transactionTail; const gate = barrier(); transactionTail = gate.promise;
    await prior; activeTransaction = true; memberLocked = false;
    const before = { member: { ...member }, request: { ...requestRow }, events: [...events] };
    let committed = false;
    try {
      const value = await callback({ select: select(true), insert, update });
      committed = true;
      if (loseCommitAcknowledgement) { loseCommitAcknowledgement = false; throw new Error("COMMIT_ACK_LOST"); }
      return value;
    } catch (error) {
      if (!committed) { member = before.member; requestRow = before.request; events = before.events; }
      throw error;
    }
    finally { activeTransaction = false; memberLocked = false; gate.release(); }
  });
  mocks.mkdir.mockImplementation(async (directory: string) => { if (directory === root && uploadHold) { uploadEntered.release(); await uploadHold.promise; } });
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
    expect([...files.keys()].filter((filePath) => path.dirname(filePath) === root)).toEqual([]);
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
