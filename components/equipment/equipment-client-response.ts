export type EquipmentClientResponse = {
  message?: string;
  error?: string;
  version?: number;
  id?: number;
  code?: "EQUIPMENT_CODE_CONFLICT" | "STALE_VERSION";
};

export type EquipmentMutationFlow =
  | "create"
  | "edit"
  | "operation"
  | "maintenance"
  | "retire";

type EquipmentMutationResult =
  | { kind: "success" }
  | { kind: "stale" }
  | { kind: "redirect" }
  | { kind: "error"; message: string };

const flowCopy: Record<EquipmentMutationFlow, { validation: string; missing: string; unavailable: string }> = {
  create: {
    validation: "ข้อมูลอุปกรณ์ไม่ถูกต้อง กรุณาตรวจสอบช่องที่กรอก",
    missing: "ไม่สามารถสร้างอุปกรณ์ได้ กรุณาตรวจสอบข้อมูล",
    unavailable: "ไม่สามารถเพิ่มอุปกรณ์ได้ชั่วคราว กรุณาลองใหม่",
  },
  edit: {
    validation: "ข้อมูลทะเบียนไม่ถูกต้อง กรุณาตรวจสอบช่องที่กรอก",
    missing: "ไม่พบอุปกรณ์ที่ต้องการแก้ไขทะเบียน",
    unavailable: "ไม่สามารถแก้ไขทะเบียนอุปกรณ์ได้ชั่วคราว กรุณาลองใหม่",
  },
  operation: {
    validation: "ข้อมูลอัปเดตสถานะไม่ถูกต้อง กรุณาตรวจสอบช่องที่กรอก",
    missing: "ไม่พบอุปกรณ์ที่ต้องการอัปเดตสถานะ",
    unavailable: "ไม่สามารถอัปเดตสถานะอุปกรณ์ได้ชั่วคราว กรุณาลองใหม่",
  },
  maintenance: {
    validation: "ข้อมูลงานบำรุงไม่ถูกต้อง กรุณาตรวจสอบช่องที่กรอก",
    missing: "ไม่พบอุปกรณ์ที่ต้องการบันทึกงานบำรุง",
    unavailable: "ไม่สามารถบันทึกงานบำรุงได้ชั่วคราว กรุณาลองใหม่",
  },
  retire: {
    validation: "ข้อมูลเลิกใช้งานไม่ถูกต้อง กรุณาตรวจสอบช่องที่กรอก",
    missing: "ไม่พบอุปกรณ์ที่ต้องการเลิกใช้งาน",
    unavailable: "ไม่สามารถเลิกใช้งานอุปกรณ์ได้ชั่วคราว กรุณาลองใหม่",
  },
};

/** อ่านเฉพาะ shape ที่ UI อนุญาต และไม่พยายาม parse body ที่ไม่ได้ประกาศเป็น JSON */
export async function readEquipmentClientResponse(
  response: Response,
): Promise<EquipmentClientResponse | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  try {
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const code =
      record.code === "EQUIPMENT_CODE_CONFLICT" || record.code === "STALE_VERSION"
        ? record.code
        : undefined;
    return {
      ...(typeof record.message === "string" ? { message: record.message } : {}),
      ...(typeof record.error === "string" ? { error: record.error } : {}),
      ...(typeof record.version === "number" ? { version: record.version } : {}),
      ...(typeof record.id === "number" ? { id: record.id } : {}),
      ...(code ? { code } : {}),
    };
  } catch {
    return null;
  }
}

/** รวมกฎ transport เพื่อให้ทุก workflow ใช้ fixed copy และไม่สะท้อน server string ที่ไม่น่าเชื่อถือ */
export async function sendEquipmentMutation(input: {
  url: string;
  method: "POST" | "PUT" | "PATCH";
  body: unknown;
  flow: EquipmentMutationFlow;
}): Promise<EquipmentMutationResult> {
  try {
    const response = await fetch(input.url, {
      method: input.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.body),
    });
    const parsed = await readEquipmentClientResponse(response);
    if (response.status === 401) {
      globalThis.location.replace("/login");
      return { kind: "redirect" };
    }
    if (response.status === 403) {
      globalThis.location.replace("/forbidden");
      return { kind: "redirect" };
    }
    if (response.status === 409) {
      if (parsed?.code === "STALE_VERSION") return { kind: "stale" };
      return {
        kind: "error",
        message:
          parsed?.code === "EQUIPMENT_CODE_CONFLICT"
            ? "รหัสอุปกรณ์นี้ถูกใช้งานแล้ว"
            : "ข้อมูลขัดแย้งกับสถานะล่าสุด กรุณาตรวจสอบแล้วลองใหม่",
      };
    }
    if (!response.ok) {
      const copy = flowCopy[input.flow];
      return {
        kind: "error",
        message:
          response.status === 400
            ? copy.validation
            : response.status === 404
              ? copy.missing
              : copy.unavailable,
      };
    }
    if (!parsed || typeof parsed.version !== "number") {
      return { kind: "error", message: flowCopy[input.flow].unavailable };
    }
    return { kind: "success" };
  } catch {
    return { kind: "error", message: flowCopy[input.flow].unavailable };
  }
}
