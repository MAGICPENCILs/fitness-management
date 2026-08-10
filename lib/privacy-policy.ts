export type PrivacyRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "COMPLETED"
  | "REJECTED";

const ALLOWED_TRANSITIONS: Record<
  PrivacyRequestStatus,
  readonly PrivacyRequestStatus[]
> = {
  PENDING: ["APPROVED", "REJECTED"],
  APPROVED: ["COMPLETED"],
  COMPLETED: [],
  REJECTED: [],
};

/** ตรวจ state transition ที่อนุญาตเพื่อกันการข้ามขั้นอนุมัติหรือเปิดคำขอ terminal ซ้ำ */
export function canTransitionRequest(
  current: PrivacyRequestStatus,
  next: PrivacyRequestStatus,
) {
  return ALLOWED_TRANSITIONS[current].includes(next);
}

/** บังคับ separation of duties โดยห้ามผู้สร้างคำขอเป็นผู้พิจารณาคำขอเดียวกัน */
export function assertSeparateReviewer(
  requestedByStaffId: number,
  reviewerStaffId: number,
) {
  if (requestedByStaffId === reviewerStaffId)
    throw new Error("ผู้สร้างและผู้พิจารณาต้องเป็นคนละคน");
}

/** สร้างค่าแทนที่ไม่สามารถย้อนกลับไประบุตัวบุคคล โดยไม่นำรหัสสมาชิกเดิมมาประกอบ */
export function buildAnonymizationValues(memberId: number, token: string) {
  const memberCode = `ANON-${memberId}-${token}`.slice(0, 20);
  return {
    memberCode,
    firstName: "ข้อมูลถูกลบ",
    lastName: memberCode,
    idCard: null,
    phone: null,
    email: null,
    birthDate: null,
    gender: null,
    address: null,
    photoUrl: null,
    status: "CANCELLED" as const,
    note: null,
  };
}

/** อนุญาต retry เฉพาะงานที่ยังเปิดและไม่ใช่ restore failure ซึ่งต้องตรวจไฟล์ด้วยคนก่อน */
export function canRetryPrivacyCleanup(
  requestStatus: PrivacyRequestStatus,
  cleanupStatus: "NOT_REQUIRED" | "PENDING" | "COMPLETED" | "FAILED",
  errorCode: string | null,
) {
  return (
    requestStatus === "APPROVED" &&
    (cleanupStatus === "PENDING" || cleanupStatus === "FAILED") &&
    errorCode !== "FILE_RESTORE_FAILED"
  );
}
