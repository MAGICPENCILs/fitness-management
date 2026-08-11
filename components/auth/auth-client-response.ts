export type AuthClientResponse = {
  error?: string;
  returnTo?: string;
};

/** อ่านเฉพาะข้อความที่ auth UI อนุญาตจาก JSON และคืน null เมื่อ transport ส่ง body ว่างหรือรูปแบบอื่น เพื่อไม่เผย parser detail แก่ผู้ใช้ */
export async function readAuthClientResponse(
  response: Response,
): Promise<AuthClientResponse | null> {
  try {
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    return {
      ...(typeof record.error === "string" ? { error: record.error } : {}),
      ...(typeof record.returnTo === "string"
        ? { returnTo: record.returnTo }
        : {}),
    };
  } catch {
    return null;
  }
}
