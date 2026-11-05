import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  transaction: vi.fn(),
  hashPassword: vi.fn(),
  txSelect: vi.fn(),
  txInsert: vi.fn(),
  txUpdate: vi.fn(),
}));

function queryResult(rows: unknown[]) {
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    for: vi.fn().mockResolvedValue(rows),
    then: (onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(onFulfilled, onRejected),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

function writeQuery() {
  const query = { values: vi.fn(), set: vi.fn(), where: vi.fn() };
  query.values.mockResolvedValue([{ insertId: 1 }]);
  query.set.mockReturnValue(query);
  query.where.mockResolvedValue([{ affectedRows: 1 }]);
  return query;
}

vi.mock("@/db", () => ({
  db: { select: mocks.dbSelect, transaction: mocks.transaction },
}));
vi.mock("@/lib/auth/password", () => ({
  validatePassword: () => ({ valid: true, errors: [] }),
  hashPassword: mocks.hashPassword,
  verifyPasswordOrDummy: vi.fn(),
}));
vi.mock("@/lib/audit-service", () => ({ runAuditedMutation: vi.fn(), writeAudit: vi.fn() }));
vi.mock("@/lib/auth/auth-repository", () => ({ authRepository: {} }));

import { createMemberApplication } from "@/lib/member-portal-service";
import { ACTIVE_PRIVACY_POLICY_VERSION } from "@/lib/consent-policy";

const input = {
  branchId: 2,
  firstName: " สมชาย ",
  lastName: " ใจดี ",
  phone: " 0812345678 ",
  email: " MEMBER@EXAMPLE.COM ",
  password: "ValidPass#2026",
  servicePrivacyConsent: true as const,
  marketingConsent: false,
};

describe("createMemberApplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hashPassword.mockResolvedValue("new-password-hash");
    mocks.dbSelect.mockReturnValue(queryResult([{ id: 2 }]));
    mocks.txInsert.mockImplementation(() => writeQuery());
    mocks.txUpdate.mockImplementation(() => writeQuery());
  });

  it("รีเซ็ตใบสมัครที่เคยถูกปฏิเสธเป็น PENDING ภายใน transaction", async () => {
    mocks.txSelect.mockImplementation((selection: Record<string, unknown>) =>
      queryResult(selection.status ? [{ id: 9, status: "REJECTED" }] : []),
    );
    mocks.transaction.mockImplementation((callback) => callback({
      select: mocks.txSelect,
      insert: mocks.txInsert,
      update: mocks.txUpdate,
    }));

    await createMemberApplication(input);

    const updateQuery = mocks.txUpdate.mock.results[0].value;
    expect(updateQuery.set).toHaveBeenCalledWith(expect.objectContaining({
      branchId: 2,
      email: "member@example.com",
      passwordHash: "new-password-hash",
      policyVersion: ACTIVE_PRIVACY_POLICY_VERSION,
      status: "PENDING",
      reviewNote: null,
      reviewedByStaffId: null,
      reviewedAt: null,
      memberId: null,
    }));
    expect(mocks.txInsert).not.toHaveBeenCalled();
  });

  it.each([
    ["บัญชีสมาชิกเดิม", [{ id: 4 }], []],
    ["ใบสมัครที่อนุมัติแล้ว", [], [{ id: 9, status: "APPROVED" }]],
    ["ใบสมัครที่ยังรอตรวจ", [], [{ id: 9, status: "PENDING" }]],
  ])("ไม่เปลี่ยนข้อมูลเมื่อพบ%s", async (_case, accounts, applications) => {
    mocks.txSelect.mockImplementation((selection: Record<string, unknown>) =>
      queryResult(selection.status ? applications : accounts),
    );
    mocks.transaction.mockImplementation((callback) => callback({
      select: mocks.txSelect,
      insert: mocks.txInsert,
      update: mocks.txUpdate,
    }));

    await createMemberApplication(input);

    expect(mocks.txInsert).not.toHaveBeenCalled();
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("กลืนเฉพาะ duplicate-key race จากรหัส driver ที่คงที่", async () => {
    mocks.transaction.mockRejectedValueOnce({ code: "ER_DUP_ENTRY", errno: 1062 });
    await expect(createMemberApplication(input)).resolves.toBeUndefined();

    mocks.transaction.mockRejectedValueOnce(new Error("duplicate text without driver code"));
    await expect(createMemberApplication(input)).rejects.toThrow("duplicate text without driver code");
  });
});
