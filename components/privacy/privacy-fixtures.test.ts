import { expect, it } from "vitest";

export const pendingRequest = {
  id: 1,
  memberId: 20,
  memberCode: "MBR00020",
  memberName: "สมาชิก ทดสอบ",
  branchId: 1,
  branchName: "Fitness Pro สาขาหลัก",
  status: "PENDING" as const,
  reason: "สมาชิกยื่นคำขอ",
  requestedByStaffId: 2,
  requestedByName: "พนักงาน เคาน์เตอร์",
  requestedAt: "2026-07-30T00:00:00.000Z",
  fileCleanupStatus: "NOT_REQUIRED" as const,
};

export const ownerPermissions = {
  canApprove: true,
  canCreate: true,
  canRetryCleanup: true,
};

export const consentSnapshot = {
  SERVICE_PRIVACY: {
    granted: true,
    policyVersion: "2026-01",
    updatedAt: "2026-07-30T00:00:00.000Z",
    actorName: "ผู้ดูแล ระบบ",
  },
  MARKETING: {
    granted: false,
    policyVersion: "2026-01",
    updatedAt: "2026-07-30T00:00:00.000Z",
    actorName: "ผู้ดูแล ระบบ",
  },
  PHOTO: {
    granted: true,
    policyVersion: "2026-01",
    updatedAt: "2026-07-30T00:00:00.000Z",
    actorName: "ผู้ดูแล ระบบ",
  },
};

it("เตรียม fixture สาม consent ประเภทสำหรับใช้ร่วมกัน", () => {
  expect(Object.keys(consentSnapshot)).toHaveLength(3);
});
