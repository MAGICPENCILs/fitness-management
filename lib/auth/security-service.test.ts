import { beforeEach, describe, expect, it } from "vitest";

import {
  createSecurityService,
  SecurityOperationError,
  type RawSecuritySession,
  type SecurityRepository,
} from "@/lib/auth/security-service";
import { createAuthSubjectFingerprint } from "@/lib/auth/request-security";
import type { ActorContext } from "@/lib/rbac";

const NOW = new Date("2026-08-10T12:00:00.000Z");
const owner: ActorContext = { staffId: 1, role: "OWNER", homeBranchId: 1 };
const manager: ActorContext = { staffId: 2, role: "MANAGER", homeBranchId: 2 };

class FakeSecurityRepository implements SecurityRepository {
  staffSubjects = [
    { id: 1, staffCode: "OWNER001", firstName: "Owner", lastName: "One", role: "OWNER" as const, homeBranchId: 1, branchName: "HQ" },
    { id: 2, staffCode: "MGR002", firstName: "Manager", lastName: "Two", role: "MANAGER" as const, homeBranchId: 2, branchName: "Branch 2" },
    { id: 3, staffCode: "CTR003", firstName: "Counter", lastName: "Three", role: "COUNTER" as const, homeBranchId: 2, branchName: "Branch 2" },
  ];
  sessions: RawSecuritySession[] = [
    { id: 11, staffId: 1, firstName: "Owner", lastName: "One", role: "OWNER" as const, homeBranchId: 1, branchName: "HQ", mode: "FULL" as const, createdAt: new Date("2026-08-10T08:00:00Z"), lastSeenAt: new Date("2026-08-10T11:55:00Z"), absoluteExpiresAt: new Date("2026-08-10T16:00:00Z"), idleExpiresAt: new Date("2026-08-10T12:25:00Z"), revokedAt: null, revokedReason: null, ipFingerprint: "a".repeat(64), userAgentCategory: "DESKTOP" },
    { id: 12, staffId: 2, firstName: "Manager", lastName: "Two", role: "MANAGER" as const, homeBranchId: 2, branchName: "Branch 2", mode: "FULL" as const, createdAt: new Date("2026-08-10T07:00:00Z"), lastSeenAt: new Date("2026-08-10T11:00:00Z"), absoluteExpiresAt: new Date("2026-08-10T15:00:00Z"), idleExpiresAt: new Date("2026-08-10T11:30:00Z"), revokedAt: null, revokedReason: null, ipFingerprint: "b".repeat(64), userAgentCategory: "MOBILE" },
  ];
  limits = [
    { id: 21, scope: "ACCOUNT" as const, subjectHash: "manager-hash", attemptCount: 4, windowStartedAt: new Date("2026-08-10T11:50:00Z"), lockedUntil: null, updatedAt: new Date("2026-08-10T11:55:00Z") },
    { id: 22, scope: "ACCOUNT" as const, subjectHash: "unknown-hash", attemptCount: 5, windowStartedAt: new Date("2026-08-10T11:40:00Z"), lockedUntil: new Date("2026-08-10T12:10:00Z"), updatedAt: new Date("2026-08-10T11:55:00Z") },
    { id: 23, scope: "IP" as const, subjectHash: "c".repeat(64), attemptCount: 20, windowStartedAt: new Date("2026-08-10T11:40:00Z"), lockedUntil: new Date("2026-08-10T12:10:00Z"), updatedAt: new Date("2026-08-10T11:55:00Z") },
  ];
  events = [
    { id: 31, branchId: null, branchName: null, actorStaffId: null, actorFirstName: null, actorLastName: null, action: "LOGIN_FAILED", entityType: "AUTH_LOGIN", entityId: null, result: "FAILED" as const, metadata: { ipFingerprint: "d".repeat(64), reasonCode: "INVALID_CREDENTIALS" }, createdAt: new Date("2026-08-10T11:58:00Z") },
    { id: 32, branchId: 2, branchName: "Branch 2", actorStaffId: 2, actorFirstName: "Manager", actorLastName: "Two", action: "LOGIN_SUCCESS", entityType: "AUTH_SESSION", entityId: 12, result: "SUCCESS" as const, metadata: { userAgentCategory: "MOBILE" }, createdAt: new Date("2026-08-10T11:00:00Z") },
    { id: 33, branchId: 1, branchName: "HQ", actorStaffId: 1, actorFirstName: "Owner", actorLastName: "One", action: "LOGIN_FAILED", entityType: "AUTH_LOGIN", entityId: null, result: "FAILED" as const, metadata: { reasonCode: "email@example.com", userAgentCategory: "raw user agent", ipFingerprint: "203.0.113.9" }, createdAt: new Date("2026-08-10T10:00:00Z") },
  ];
  revokedSessions: number[] = [];
  revokedStaff: number[] = [];
  clearedLimits: number[] = [];

  async listStaffSubjects(branchId?: number) {
    return branchId
      ? this.staffSubjects.filter((row) => row.homeBranchId === branchId)
      : this.staffSubjects;
  }
  async listSessions(query: { page: number; pageSize: number; branchId?: number; staffId?: number }) {
    const rows = this.sessions.filter(
      (row) =>
        (!query.branchId || row.homeBranchId === query.branchId) &&
        (!query.staffId || row.staffId === query.staffId),
    );
    return { rows, total: rows.length };
  }
  async listLimits(query: { allowedAccountHashes?: string[] }) {
    const rows = query.allowedAccountHashes
      ? this.limits.filter(
          (row) =>
            row.scope === "ACCOUNT" &&
            query.allowedAccountHashes!.includes(row.subjectHash),
        )
      : this.limits;
    return { rows, total: rows.length };
  }
  async listEvents(query: { branchId?: number }) {
    const rows = query.branchId
      ? this.events.filter((row) => row.branchId === query.branchId)
      : this.events;
    return { rows, total: rows.length };
  }
  async findSessionTarget(id: number) { return this.sessions.find((row) => row.id === id) ?? null; }
  async findStaffTarget(id: number) { return this.staffSubjects.find((row) => row.id === id) ?? null; }
  async findLimit(id: number) { return this.limits.find((row) => row.id === id) ?? null; }
  async revokeSessionWithAudit(input: { sessionId: number }) { this.revokedSessions.push(input.sessionId); }
  async revokeStaffSessionsWithAudit(input: { staffId: number }) { this.revokedStaff.push(input.staffId); }
  async clearLimitWithAudit(input: { limitId: number }) { this.clearedLimits.push(input.limitId); }
}

describe("admin security service", () => {
  let repository: FakeSecurityRepository;
  let service: ReturnType<typeof createSecurityService>;

  beforeEach(() => {
    process.env.AUTH_FINGERPRINT_SECRET = "test-fingerprint-secret-that-is-at-least-32-bytes";
    repository = new FakeSecurityRepository();
    repository.limits[0].subjectHash = createAuthSubjectFingerprint("MGR002");
    service = createSecurityService({ repository, now: () => NOW });
  });

  it("Owner เห็นทุกสาขา รวม unknown event, unmatched ACCOUNT และ IP โดยไม่คืน hash เต็ม", async () => {
    const dashboard = await service.getSecurityDashboard(owner, { page: 1, pageSize: 20 });
    expect(dashboard.sessions.pagination.total).toBe(2);
    expect(dashboard.limits.rows.map((row) => row.id)).toEqual([21, 22, 23]);
    expect(dashboard.events.rows.some((row) => row.actorStaffId === null)).toBe(true);
    expect(JSON.stringify(dashboard)).not.toContain("c".repeat(64));
    expect(JSON.stringify(dashboard)).not.toContain("d".repeat(64));
    expect(JSON.stringify(dashboard)).not.toContain("email@example.com");
    expect(JSON.stringify(dashboard)).not.toContain("raw user agent");
    expect(JSON.stringify(dashboard)).not.toContain("203.0.113.9");
  });

  it("Manager เห็น session/event ในสาขาตนและเฉพาะ ACCOUNT bucket ที่ resolve เป็น Staff ในสาขา", async () => {
    const dashboard = await service.getSecurityDashboard(manager, { page: 1, pageSize: 20 });
    expect(dashboard.sessions.rows.map((row) => row.id)).toEqual([12]);
    expect(dashboard.limits.rows.map((row) => row.id)).toEqual([21]);
    expect(dashboard.events.rows.map((row) => row.id)).toEqual([32]);
  });

  it("คำนวณสถานะ session จาก revoke และ expiry โดยไม่คืน token hash หรือ fingerprint เต็ม", async () => {
    repository.sessions[0].revokedAt = new Date("2026-08-10T10:00:00Z");
    const dashboard = await service.getSecurityDashboard(owner, { page: 1, pageSize: 20 });
    expect(dashboard.sessions.rows.map((row) => [row.id, row.status])).toEqual([[11, "REVOKED"], [12, "EXPIRED"]]);
    expect(JSON.stringify(dashboard.sessions)).not.toContain("a".repeat(64));
    expect(JSON.stringify(dashboard.sessions)).not.toContain("sessionTokenHash");
  });

  it("Manager revoke ได้เฉพาะ session และ Staff ที่ไม่ใช่ Owner ในสาขาตน", async () => {
    await service.revokeSecuritySession(manager, 12);
    await service.revokeStaffSessions(manager, 3);
    await expect(service.revokeSecuritySession(manager, 11)).rejects.toMatchObject({ status: 403 });
    await expect(service.revokeStaffSessions(manager, 1)).rejects.toMatchObject({ status: 403 });
    expect(repository.revokedSessions).toEqual([12]);
    expect(repository.revokedStaff).toEqual([3]);
  });

  it("Manager clear ได้เฉพาะ ACCOUNT bucket ที่ resolve เป็น non-Owner ในสาขาตน", async () => {
    await service.clearLoginLimit(manager, 21);
    await expect(service.clearLoginLimit(manager, 22)).rejects.toMatchObject({ status: 403 });
    await expect(service.clearLoginLimit(manager, 23)).rejects.toMatchObject({ status: 403 });
    expect(repository.clearedLimits).toEqual([21]);
  });

  it("คืน 404 สำหรับ security target ที่ไม่มีและไม่เรียก mutation", async () => {
    await expect(service.revokeSecuritySession(owner, 999)).rejects.toEqual(expect.objectContaining<Partial<SecurityOperationError>>({ status: 404 }));
    await expect(service.revokeStaffSessions(owner, 999)).rejects.toMatchObject({ status: 404 });
    await expect(service.clearLoginLimit(owner, 999)).rejects.toMatchObject({ status: 404 });
    expect(repository.revokedSessions).toEqual([]);
    expect(repository.revokedStaff).toEqual([]);
    expect(repository.clearedLimits).toEqual([]);
  });
});
