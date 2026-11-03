export const REPORT_TYPES = ["members", "peak-hours", "promotions", "vat", "workforce"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

/** ตรวจวันที่ปฏิทินจริงและคืนขอบบนแบบ exclusive เพื่อไม่ตกข้อมูลช่วงท้ายวัน */
export function parseReportRange(from: string, to: string) {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("REPORT_DATE_INVALID");
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) throw new Error("REPORT_DATE_INVALID");
    return date;
  };
  const start = parse(from); const end = parse(to);
  if (start > end) throw new Error("REPORT_RANGE_INVALID");
  const endExclusive = new Date(end); endExclusive.setDate(endExclusive.getDate() + 1);
  return { from, to, start, endExclusive };
}

/** ครอบ CSV ทุก cell และ prefix ค่าอันตรายเพื่อไม่ให้ spreadsheet รันสูตรจากข้อมูลผู้ใช้ */
function csvCell(value: string | number | null) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

/** สร้าง UTF-8 BOM CSV ให้ Excel อ่านภาษาไทยและ newline ได้สม่ำเสมอ */
export function buildCsv(rows: Array<Array<string | number | null>>) {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
