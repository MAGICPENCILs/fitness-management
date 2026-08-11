import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setCurrentStaffCookie: vi.fn(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
}));

vi.mock("@/lib/staff-service", () => ({
  setCurrentStaffCookie: mocks.setCurrentStaffCookie,
  StaffOperationError: class StaffOperationError extends Error {
    constructor(message: string, public status: number) { super(message); }
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.cookieSet, delete: mocks.cookieDelete }),
}));

import { POST } from "@/app/api/staff/select/route";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { StaffOperationError } from "@/lib/staff-service";

function request(body: string) {
  return new Request("https://fitness.example/api/staff/select", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://fitness.example",
    },
    body,
  });
}

describe("development Staff select route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_ORIGIN", "https://fitness.example");
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["production", "true"],
    ["development", "false"],
  ])("returns 404 before parsing the body in %s/%s", async (nodeEnv, flag) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("ENABLE_DEV_STAFF_SWITCHER", flag);
    const bodyRead = vi.fn(() => Promise.reject(new Error("body parsed")));
    const input = { json: bodyRead } as unknown as Request;

    const response = await POST(input);

    expect(response.status).toBe(404);
    expect(bodyRead).not.toHaveBeenCalled();
    expect(mocks.setCurrentStaffCookie).not.toHaveBeenCalled();
  });

  it("sets rotated auth cookie and deletes the legacy Staff cookie only after success", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_STAFF_SWITCHER", "true");
    mocks.setCurrentStaffCookie.mockResolvedValue({ sessionCookie: "rotated-cookie" });

    const response = await POST(request('{"staffId":3}'));

    expect(response.status).toBe(200);
    expect(mocks.cookieSet).toHaveBeenCalledWith(expect.objectContaining({
      name: AUTH_COOKIE_NAME,
      value: "rotated-cookie",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    }));
    expect(mocks.cookieDelete).toHaveBeenCalledWith("fitness_staff_id");
  });

  it.each([401, 403, 404])("returns service status %s without changing cookies", async (status) => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_STAFF_SWITCHER", "true");
    mocks.setCurrentStaffCookie.mockRejectedValue(
      new StaffOperationError("รายละเอียดภายใน", status),
    );

    const response = await POST(request('{"staffId":3}'));

    expect(response.status).toBe(status);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    expect(mocks.cookieDelete).not.toHaveBeenCalled();
  });

  it("rejects an untrusted Origin before authentication or cookie changes", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_STAFF_SWITCHER", "true");
    const untrusted = new Request("https://fitness.example/api/staff/select", {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        "content-type": "application/json",
      },
      body: '{"staffId":3}',
    });

    const response = await POST(untrusted);

    expect(response.status).toBe(403);
    expect(mocks.setCurrentStaffCookie).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});
