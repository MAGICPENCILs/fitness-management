import { expect, it, vi } from "vitest";

vi.mock("fs/promises", () => ({ readFile: async () => Buffer.from("private image") }));
import { GET } from "@/app/member-photos/[filename]/route";

it("never serves bytes through an old opaque filename URL", async () => {
  const response = await GET();
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "ไม่พบรูปสมาชิก" });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
});
