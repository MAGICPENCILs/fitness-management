import type { StaffRole } from "@/lib/rbac";

export type StaffSelectionRow = {
  id: number;
  staffCode: string;
  role: StaffRole;
  homeBranchId: number;
  status: "ACTIVE" | "INACTIVE";
};

export class StaffContextError extends Error {
  /** สร้างข้อผิดพลาด staff context พร้อม HTTP status สำหรับ route handler */
  constructor(
    message: string,
    public status: 401 | 503,
  ) {
    super(message);
    this.name = "StaffContextError";
  }
}

/** เลือกพนักงานจาก cookie โดย fallback เป็น Owner เฉพาะการเปิดระบบครั้งแรก */
export function resolveStaffSelection<T extends StaffSelectionRow>(
  rows: readonly T[],
  cookieValue: string | undefined,
): T {
  if (cookieValue === undefined) {
    const owner = rows.find(
      (row) => row.role === "OWNER" && row.status === "ACTIVE",
    );
    if (!owner)
      throw new StaffContextError(
        "ระบบยังไม่มีบัญชี Owner ที่เปิดใช้งาน",
        503,
      );
    return owner;
  }

  const requestedId = Number(cookieValue);
  if (!Number.isInteger(requestedId) || requestedId <= 0)
    throw new StaffContextError("ข้อมูลพนักงานปัจจุบันไม่ถูกต้อง", 401);

  const selected = rows.find(
    (row) => row.id === requestedId && row.status === "ACTIVE",
  );
  if (!selected)
    throw new StaffContextError(
      "ไม่พบบัญชีพนักงานที่เปิดใช้งานสำหรับบริบทนี้",
      401,
    );
  return selected;
}
