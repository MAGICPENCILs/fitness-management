import type { StaffRole } from "@/lib/rbac";

export type SessionMode = "FULL" | "PASSWORD_CHANGE_REQUIRED";

export type SessionClaims = {
  sessionId: string;
  staffId: number;
  role: StaffRole;
  homeBranchId: number;
  mode: SessionMode;
  expiresAt: number;
};

export type UserAgentCategory =
  | "DESKTOP"
  | "MOBILE"
  | "TABLET"
  | "BOT"
  | "UNKNOWN";

export type RequestFingerprintInput = {
  ipFingerprint: string | null;
  userAgentCategory: UserAgentCategory;
};
