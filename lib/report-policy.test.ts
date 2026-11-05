import { describe, expect, it } from "vitest";
import { buildCsv, parseReportRange } from "@/lib/report-policy";

describe("report policy", () => {
  it("สร้างช่วงวันที่แบบ inclusive โดยใช้ขอบบนวันถัดไป", () => {
    const range = parseReportRange("2026-11-01", "2026-11-30");
    expect(range.start).toEqual(new Date("2026-11-01T00:00:00"));
    expect(range.endExclusive).toEqual(new Date("2026-12-01T00:00:00"));
  });

  it("ปฏิเสธวันที่ไม่มีจริงและช่วงย้อนกลับ", () => {
    expect(() => parseReportRange("2026-02-30", "2026-03-01")).toThrow("REPORT_DATE_INVALID");
    expect(() => parseReportRange("2026-11-02", "2026-11-01")).toThrow("REPORT_RANGE_INVALID");
  });

  it("escape quote/comma และกัน spreadsheet formula injection", () => {
    expect(buildCsv([["ชื่อ", "ค่า"], ['สมาชิก, "VIP"', "=1+1"]])).toBe(
      '\uFEFF"ชื่อ","ค่า"\r\n"สมาชิก, ""VIP""","\'=1+1"',
    );
  });
});
