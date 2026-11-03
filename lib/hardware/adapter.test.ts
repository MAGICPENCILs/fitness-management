import { describe, expect, it, vi } from "vitest";
import { readCredential, requestDoorOpen } from "@/lib/hardware/adapter";

describe("access hardware adapter", () => {
  it("ปิด hardware เป็นค่าเริ่มต้นโดยไม่เรียก network", async () => {
    const request = vi.fn();
    await expect(
      requestDoorOpen({ mode: "disabled" }, { request }),
    ).resolves.toEqual({ opened: false, status: "DISABLED" });
    expect(request).not.toHaveBeenCalled();
  });

  it("simulator คืน credential และเปิดประตูแบบ deterministic", async () => {
    await expect(readCredential({ mode: "simulate" })).resolves.toEqual({
      status: "READ",
      serial: "SIM-CARD-001",
    });
    await expect(requestDoorOpen({ mode: "simulate" })).resolves.toEqual({
      opened: true,
      status: "OPENED",
    });
  });

  it("ไม่อ้างว่าเปิดประตูเมื่อ webhook timeout หรือ provider ไม่ยืนยัน opened", async () => {
    const timeout = vi.fn().mockRejectedValue(new Error("timeout"));
    await expect(
      requestDoorOpen(
        {
          mode: "webhook",
          baseUrl: "https://door.example/",
          token: "secret",
        },
        { request: timeout },
      ),
    ).resolves.toEqual({ opened: false, status: "UNAVAILABLE" });

    const notOpened = vi.fn().mockResolvedValue(
      Response.json({ opened: false }, { status: 200 }),
    );
    await expect(
      requestDoorOpen(
        {
          mode: "webhook",
          baseUrl: "https://door.example/",
          token: "secret",
        },
        { request: notOpened },
      ),
    ).resolves.toEqual({ opened: false, status: "REJECTED" });
  });
});
