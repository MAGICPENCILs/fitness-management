import { describe, expect, it } from "vitest";
import {
  executeAnonymizationPlan,
  type AnonymizationOperation,
} from "@/lib/privacy-anonymization";

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
