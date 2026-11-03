export type AnonymizationOperation = {
  table:
    | "members"
    | "card_pool"
    | "access_logs"
    | "member_crm_profiles"
    | "crm_interactions"
    | "notifications"
    | "loyalty_points"
    | "pt_packages"
    | "pt_sessions"
    | "payments"
    | "receipts"
    | "freeze_records"
    | "member_access_tokens"
    | "locker_rentals"
    | "consent_events"
    | "privacy_requests"
    | "privacy_file_cleanups"
    | "audit_logs";
  action: "UPDATE" | "INSERT";
  fields: readonly string[];
};

export type AnonymizationOperationExecutor = {
  execute(operation: AnonymizationOperation): Promise<void>;
};

const ANONYMIZATION_OPERATIONS: readonly AnonymizationOperation[] = [
  {
    table: "members",
    action: "UPDATE",
    fields: [
      "memberCode",
      "firstName",
      "lastName",
      "idCard",
      "phone",
      "email",
      "birthDate",
      "gender",
      "address",
      "photoUrl",
      "status",
      "note",
    ],
  },
  { table: "card_pool", action: "UPDATE", fields: ["memberId", "status", "assignedAt"] },
  { table: "access_logs", action: "UPDATE", fields: ["serial", "reason"] },
  {
    table: "member_crm_profiles",
    action: "UPDATE",
    fields: ["interests", "fitnessGoals", "preferredContact"],
  },
  { table: "crm_interactions", action: "UPDATE", fields: ["summary"] },
  {
    table: "notifications",
    action: "UPDATE",
    fields: ["recipient", "title", "message", "errorMessage"],
  },
  { table: "loyalty_points", action: "UPDATE", fields: ["source", "note"] },
  { table: "pt_packages", action: "UPDATE", fields: ["note"] },
  {
    table: "pt_sessions",
    action: "UPDATE",
    fields: ["weightKg", "bmi", "waistCm", "workoutSummary", "trainerNote"],
  },
  { table: "payments", action: "UPDATE", fields: ["note"] },
  {
    table: "receipts",
    action: "UPDATE",
    fields: ["buyerName", "buyerTaxId", "buyerAddress"],
  },
  { table: "freeze_records", action: "UPDATE", fields: ["reason"] },
  { table: "member_access_tokens", action: "UPDATE", fields: ["revokedAt"] },
  { table: "locker_rentals", action: "UPDATE", fields: ["note"] },
  {
    table: "consent_events",
    action: "INSERT",
    fields: [
      "memberId",
      "branchId",
      "recordedByStaffId",
      "consentType",
      "action",
      "policyVersion",
      "source",
      "note",
    ],
  },
  {
    table: "privacy_requests",
    action: "UPDATE",
    fields: [
      "status",
      "openRequestKey",
      "completedAt",
      "fileCleanupStatus",
      "fileCleanupError",
    ],
  },
  {
    table: "privacy_file_cleanups",
    action: "INSERT",
    fields: [
      "memberId",
      "privacyRequestId",
      "source",
      "quarantineToken",
      "status",
    ],
  },
  {
    table: "audit_logs",
    action: "INSERT",
    fields: [
      "actorStaffId",
      "branchId",
      "action",
      "entityType",
      "entityId",
      "result",
      "metadata",
    ],
  },
];

/** ส่งแผนการล้าง PII ตามลำดับให้ executor เดียว เพื่อให้การทดสอบและ transaction จริงใช้ขอบเขตเดียวกัน */
export async function executeAnonymizationPlan(
  executor: AnonymizationOperationExecutor,
) {
  for (const operation of ANONYMIZATION_OPERATIONS)
    await executor.execute(operation);
}
