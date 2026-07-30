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

