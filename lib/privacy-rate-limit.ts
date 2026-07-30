const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

const windows = new Map<string, { count: number; resetAt: number }>();

export class PrivacyRateLimitError extends Error {
  readonly status = 429;

  /** สร้างข้อผิดพลาด 429 สำหรับ privacy API ที่เกิน fixed window */
  constructor() {
    super("ส่งคำขอถี่เกินไป กรุณารอแล้วลองใหม่");
    this.name = "PrivacyRateLimitError";
  }
}

/** ใช้โควตา privacy API แบบ fixed window 10 ครั้งต่อนาทีต่อ key */
export function consumePrivacyLimit(key: string, now = Date.now()) {
  const current = windows.get(key);
  if (!current || now >= current.resetAt) {
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  if (current.count >= MAX_REQUESTS) throw new PrivacyRateLimitError();
  current.count += 1;
}
