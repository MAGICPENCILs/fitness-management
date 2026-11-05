export type HardwareEnvironment = {
  mode: "disabled" | "simulate" | "webhook";
  baseUrl?: string;
  token?: string;
};

type HardwareDependencies = { request?: typeof fetch };

/** โหลด hardware config แบบ fail closed และยอมรับ endpoint ที่ใช้ HTTPS เท่านั้น */
export function loadHardwareEnvironment(
  source: Record<string, string | undefined> = process.env,
): HardwareEnvironment {
  const mode =
    source.ACCESS_HARDWARE_MODE === "simulate" ||
    source.ACCESS_HARDWARE_MODE === "webhook"
      ? source.ACCESS_HARDWARE_MODE
      : "disabled";
  let baseUrl: string | undefined;
  try {
    const parsed = new URL(source.ACCESS_HARDWARE_BASE_URL ?? "");
    if (parsed.protocol === "https:") baseUrl = parsed.toString();
  } catch {
    baseUrl = undefined;
  }
  return { mode, baseUrl, token: source.ACCESS_HARDWARE_TOKEN };
}

/** อ่าน credential จาก simulator หรือ controller โดยไม่เผย token/response body เมื่อผิดพลาด */
export async function readCredential(
  environment: HardwareEnvironment,
  dependencies: HardwareDependencies = {},
): Promise<
  | { status: "READ"; serial: string }
  | { status: "DISABLED" | "UNAVAILABLE" | "INVALID" }
> {
  if (environment.mode === "disabled") return { status: "DISABLED" };
  if (environment.mode === "simulate")
    return { status: "READ", serial: "SIM-CARD-001" };
  if (!environment.baseUrl || !environment.token)
    return { status: "UNAVAILABLE" };
  try {
    const response = await (dependencies.request ?? fetch)(
      new URL("credential", environment.baseUrl),
      {
        headers: { Authorization: `Bearer ${environment.token}` },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) return { status: "UNAVAILABLE" };
    const body = (await response.json()) as { serial?: unknown };
    return typeof body.serial === "string" && body.serial.trim().length <= 20
      ? { status: "READ", serial: body.serial.trim() }
      : { status: "INVALID" };
  } catch {
    return { status: "UNAVAILABLE" };
  }
}

/** ขอเปิดประตูหลังระบบธุรกิจ commit การอนุมัติแล้ว และถือว่าเปิดเฉพาะเมื่อ controller ยืนยัน opened=true */
export async function requestDoorOpen(
  environment: HardwareEnvironment,
  dependencies: HardwareDependencies = {},
): Promise<{
  opened: boolean;
  status: "OPENED" | "DISABLED" | "UNAVAILABLE" | "REJECTED";
}> {
  if (environment.mode === "disabled")
    return { opened: false, status: "DISABLED" };
  if (environment.mode === "simulate")
    return { opened: true, status: "OPENED" };
  if (!environment.baseUrl || !environment.token)
    return { opened: false, status: "UNAVAILABLE" };
  try {
    const response = await (dependencies.request ?? fetch)(
      new URL("door/open", environment.baseUrl),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${environment.token}`,
        },
        body: "{}",
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) return { opened: false, status: "UNAVAILABLE" };
    const body = (await response.json()) as { opened?: unknown };
    return body.opened === true
      ? { opened: true, status: "OPENED" }
      : { opened: false, status: "REJECTED" };
  } catch {
    return { opened: false, status: "UNAVAILABLE" };
  }
}

/** คืน readiness สำหรับ kiosk โดยไม่คืน URL หรือ token */
export function getHardwareHealth(environment = loadHardwareEnvironment()) {
  return {
    mode: environment.mode,
    ready:
      environment.mode === "simulate" ||
      (environment.mode === "webhook" &&
        Boolean(environment.baseUrl && environment.token)),
  };
}
