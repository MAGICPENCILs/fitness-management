export type AuthErrorCode =
  | "INVALID_CREDENTIALS"
  | "RATE_LIMITED"
  | "AUTH_UNAVAILABLE";

/** เก็บเฉพาะรหัสและสถานะ HTTP ที่ route แปลงเป็น response กลางได้ โดยไม่แนบ credential หรือรายละเอียดฐานข้อมูล */
export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    public readonly status: number,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
