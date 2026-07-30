import { expect, it } from "vitest";
import {
  consumePrivacyLimit,
  PrivacyRateLimitError,
} from "@/lib/privacy-rate-limit";

it("อนุญาต 10 ครั้งต่อนาทีและปฏิเสธครั้งที่ 11 ด้วย 429", () => {
  const key = "staff:rate-limit-boundary";
  const now = 1_000_000;
  for (let index = 0; index < 10; index += 1) {
    expect(() => consumePrivacyLimit(key, now)).not.toThrow();
  }
  try {
    consumePrivacyLimit(key, now);
    throw new Error("expected rate limit");
  } catch (error) {
    expect(error).toBeInstanceOf(PrivacyRateLimitError);
    expect((error as PrivacyRateLimitError).status).toBe(429);
  }
});

it("เริ่ม window ใหม่เมื่อครบ 60 วินาที", () => {
  const key = "staff:rate-limit-reset";
  const now = 2_000_000;
  for (let index = 0; index < 10; index += 1)
    consumePrivacyLimit(key, now);
  expect(() => consumePrivacyLimit(key, now + 60_000)).not.toThrow();
});
