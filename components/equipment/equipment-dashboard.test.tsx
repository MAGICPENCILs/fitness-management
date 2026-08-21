// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EquipmentDashboard } from "@/components/equipment/equipment-dashboard";
import type {
  EquipmentDashboardDto,
  EquipmentDashboardFilters,
  EquipmentDto,
} from "@/lib/equipment-service";

afterEach(() => cleanup());

const filters: EquipmentDashboardFilters = {
  search: "BIKE",
  status: "OPERATIONAL",
  category: "CARDIO",
  maintenance: "DUE_SOON",
  tab: "equipment",
  page: 1,
  historyPage: 3,
  pageSize: 20,
  historyEquipmentId: 7,
  historyType: "REPAIR",
  historyStatus: "COMPLETED",
};

const equipment: EquipmentDto[] = [
  {
    id: 7,
    code: "BIKE-007",
    name: "จักรยานสปิน",
    category: "CARDIO",
    location: "โซน A",
    serialNumber: "SN-007",
    status: "OPERATIONAL",
    retiredAt: null,
    retiredReason: null,
    version: 4,
    purchaseDate: "2025-01-10",
    warrantyEndDate: "2027-01-10",
    currentUsageHours: 100,
    maintenanceIntervalHours: 200,
    nextMaintenanceHours: 150,
    nextMaintenanceDate: "2026-08-25",
    lastMaintenanceDate: "2026-01-10",
    note: "INTERNAL-NOTE-DO-NOT-RENDER",
    maintenanceState: "DUE_SOON",
    remainingHours: 50,
    remainingDays: 4,
    createdAt: "2026-01-01T02:00:00.000Z",
    updatedAt: "2026-08-20T03:00:00.000Z",
  },
  {
    id: 8,
    code: "RET-008",
    name: "ลู่วิ่งเดิม",
    category: "CARDIO",
    location: "คลัง",
    serialNumber: null,
    status: "RETIRED",
    retiredAt: "2026-08-01T01:00:00.000Z",
    retiredReason: "PRIVATE-RETIREMENT-REASON",
    version: 8,
    purchaseDate: null,
    warrantyEndDate: null,
    currentUsageHours: 9000,
    maintenanceIntervalHours: null,
    nextMaintenanceHours: null,
    nextMaintenanceDate: null,
    lastMaintenanceDate: "2026-07-01",
    note: "SECRET-BRANCH-METADATA",
    maintenanceState: "OVERDUE",
    remainingHours: -10,
    remainingDays: -1,
    createdAt: null,
    updatedAt: null,
  },
];

const dashboard: EquipmentDashboardDto = {
  summary: {
    total: 40,
    operational: 12,
    maintenance: 8,
    outOfService: 5,
    retired: 15,
    overdue: 4,
    dueSoon: 9,
  },
  equipment,
  history: [
    {
      id: 80,
      equipmentId: 7,
      equipmentCode: "BIKE-007",
      equipmentName: "จักรยานสปิน",
      type: "REPAIR",
      status: "COMPLETED",
      scheduledDate: "2026-08-20",
      completedDate: "2026-08-21",
      usageHoursAtService: 100,
      cost: 1250.5,
      technician: "สมชาย",
      note: "PRIVATE-HISTORY-NOTE",
      createdAt: "2026-08-21T04:30:00.000Z",
    },
  ],
  equipmentPagination: { page: 1, pageSize: 20, total: 23, totalPages: 2 },
  historyPagination: { page: 3, pageSize: 20, total: 65, totalPages: 4 },
};

function hrefParams(link: HTMLElement) {
  return new URL(link.getAttribute("href") ?? "", "http://localhost").searchParams;
}

describe("equipment dashboard", () => {
  it("แสดง summary ทั้งสาขาพร้อม label โดยไม่คำนวณใหม่จากแถวหน้าปัจจุบัน", () => {
    render(
      <EquipmentDashboard
        {...dashboard}
        filters={filters}
        today="2026-08-21"
        canManage={false}
      />,
    );

    expect(screen.getByText("อุปกรณ์ทั้งหมด 40 เครื่อง")).toBeVisible();
    expect(screen.getByText("พร้อมใช้งาน 12 เครื่อง")).toBeVisible();
    expect(screen.getByText("เลิกใช้งาน 15 เครื่อง")).toBeVisible();
    expect(screen.getByText("เกินกำหนด 4 เครื่อง")).toBeVisible();
  });

  it("สร้าง tab และ pagination URL จาก allowlist พร้อมแยก page ของแต่ละ tab", () => {
    render(
      <EquipmentDashboard
        {...dashboard}
        filters={{ ...filters, page: 4 }}
        today="2026-08-21"
        canManage={false}
      />,
    );

    const historyTab = screen.getByRole("link", { name: "ประวัติการบำรุงรักษา" });
    const historyParams = hrefParams(historyTab);
    expect(historyParams.get("tab")).toBe("history");
    expect(historyParams.get("page")).toBe("4");
    expect(historyParams.get("historyPage")).toBe("1");
    expect(historyParams.get("search")).toBe("BIKE");
    expect(historyParams.get("historyEquipmentId")).toBe("7");
    expect(historyParams.get("historyType")).toBe("REPAIR");
    expect(historyParams.get("historyStatus")).toBe("COMPLETED");
    expect(historyParams.has("pageSize")).toBe(false);

    const equipmentTab = screen.getByRole("link", { name: "ทะเบียนอุปกรณ์" });
    const equipmentParams = hrefParams(equipmentTab);
    expect(equipmentParams.get("page")).toBe("1");
    expect(equipmentParams.get("historyPage")).toBe("3");

    const nextParams = hrefParams(screen.getByRole("link", { name: "หน้าถัดไป" }));
    expect(nextParams.get("page")).toBe("2");
    expect(nextParams.get("status")).toBe("OPERATIONAL");
    expect(nextParams.get("category")).toBe("CARDIO");
    expect(nextParams.get("maintenance")).toBe("DUE_SOON");
  });

  it("ใช้ semantic table และ mobile list ที่มีข้อมูลเทียบเท่ากันพร้อมข้อความสถานะและไอคอนตกแต่ง", () => {
    const { container } = render(
      <EquipmentDashboard
        {...dashboard}
        filters={filters}
        today="2026-08-21"
        canManage={false}
      />,
    );

    const table = screen.getByRole("table", { name: "ทะเบียนอุปกรณ์ในหน้าปัจจุบัน" });
    expect(within(table).getByRole("columnheader", { name: "อุปกรณ์" })).toBeVisible();
    expect(within(table).getByRole("columnheader", { name: "สถานะ" })).toBeVisible();
    expect(screen.getByRole("list", { name: "ทะเบียนอุปกรณ์สำหรับมือถือ" })).toBeInTheDocument();
    expect(screen.getAllByText("BIKE-007")).toHaveLength(2);
    expect(screen.getAllByText("พร้อมใช้งาน")).not.toHaveLength(0);
    expect(screen.getAllByText("ใกล้ถึงกำหนด")).not.toHaveLength(0);
    expect(container.querySelectorAll("svg[aria-hidden='true']").length).toBeGreaterThan(0);
  });

  it("แสดงทั้งมิติชั่วโมงและวันเมื่อวันที่เกินกำหนดแต่ชั่วโมงยังเหลือ", () => {
    const mixedThresholdItem = {
      ...equipment[0],
      maintenanceState: "OVERDUE" as const,
      remainingHours: 100,
      remainingDays: -1,
    };
    render(
      <EquipmentDashboard
        {...dashboard}
        equipment={[mixedThresholdItem]}
        equipmentPagination={{ page: 1, pageSize: 20, total: 1, totalPages: 1 }}
        filters={filters}
        today="2026-08-21"
        canManage={false}
      />,
    );

    expect(
      screen.getAllByText("ชั่วโมง: เหลือ 100 ชม. · วันที่: เกิน 1 วัน"),
    ).toHaveLength(2);
  });

  it("แสดง RETIRED โดยไม่แสดงความเร่งด่วนบำรุงทั้ง table และ mobile card", () => {
    render(
      <EquipmentDashboard
        {...dashboard}
        filters={filters}
        today="2026-08-21"
        canManage
      />,
    );

    expect(screen.getAllByText("เลิกใช้งาน")).not.toHaveLength(0);
    const retiredTableRow = within(
      screen.getByRole("table", { name: "ทะเบียนอุปกรณ์ในหน้าปัจจุบัน" }),
    )
      .getByText("RET-008")
      .closest("tr");
    const retiredMobileCard = within(
      screen.getByRole("list", { name: "ทะเบียนอุปกรณ์สำหรับมือถือ" }),
    )
      .getByText("RET-008")
      .closest("article");
    expect(retiredTableRow).not.toBeNull();
    expect(retiredMobileCard).not.toBeNull();
    expect(
      within(retiredTableRow!).queryByText("เกินกำหนด"),
    ).not.toBeInTheDocument();
    expect(
      within(retiredMobileCard!).queryByText("เกินกำหนด"),
    ).not.toBeInTheDocument();
    expect(within(retiredTableRow!).getByText("สิ้นสุดการใช้งาน")).toBeVisible();
    expect(within(retiredMobileCard!).getByText("สิ้นสุดการใช้งาน")).toBeVisible();
    expect(screen.queryByText("PRIVATE-RETIREMENT-REASON")).not.toBeInTheDocument();
    expect(screen.queryByText("INTERNAL-NOTE-DO-NOT-RENDER")).not.toBeInTheDocument();
    expect(screen.queryByText("SECRET-BRANCH-METADATA")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "เพิ่มอุปกรณ์" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "อัปเดตมิเตอร์" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "บันทึกงานบำรุง" })).not.toBeInTheDocument();
  });

  it("แบ่ง empty branch และ filtered-empty พร้อมลิงก์กู้คืนที่ไม่ล้าง filter อีก tab", () => {
    const { rerender } = render(
      <EquipmentDashboard
        {...dashboard}
        equipment={[]}
        equipmentPagination={{ page: 1, pageSize: 20, total: 0, totalPages: 0 }}
        filters={filters}
        today="2026-08-21"
        canManage={false}
      />,
    );

    expect(screen.getByText("ไม่พบอุปกรณ์ที่ตรงกับตัวกรอง")).toBeVisible();
    const resetParams = hrefParams(screen.getByRole("link", { name: "ล้างตัวกรองอุปกรณ์" }));
    expect(resetParams.has("search")).toBe(false);
    expect(resetParams.has("status")).toBe(false);
    expect(resetParams.has("page")).toBe(false);
    expect(resetParams.get("historyPage")).toBe("3");
    expect(resetParams.get("historyType")).toBe("REPAIR");

    rerender(
      <EquipmentDashboard
        {...dashboard}
        summary={{ total: 0, operational: 0, maintenance: 0, outOfService: 0, retired: 0, overdue: 0, dueSoon: 0 }}
        equipment={[]}
        equipmentPagination={{ page: 1, pageSize: 20, total: 0, totalPages: 0 }}
        filters={{ ...filters, search: "", status: "ALL", category: "ALL", maintenance: "ALL" }}
        today="2026-08-21"
        canManage={false}
      />,
    );
    expect(screen.getByText("ยังไม่มีอุปกรณ์ในสาขานี้")).toBeVisible();
    expect(screen.queryByRole("link", { name: "ล้างตัวกรองอุปกรณ์" })).not.toBeInTheDocument();
  });

  it("แสดง history filters และ URL pagination โดยไม่เปิดเผย note", () => {
    render(
      <EquipmentDashboard
        {...dashboard}
        filters={{ ...filters, tab: "history" }}
        today="2026-08-21"
        canManage={false}
      />,
    );

    expect(screen.getByLabelText("อุปกรณ์ ID")).toHaveValue(7);
    expect(screen.getByLabelText("ประเภทงาน")).toHaveValue("REPAIR");
    expect(screen.getByLabelText("สถานะงาน")).toHaveValue("COMPLETED");
    expect(screen.getByRole("table", { name: "ประวัติการบำรุงรักษาในหน้าปัจจุบัน" })).toBeInTheDocument();
    expect(screen.queryByText("PRIVATE-HISTORY-NOTE")).not.toBeInTheDocument();

    const current = screen.getByRole("link", { name: "หน้า 3" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.className).toContain("size-11");
    const nextParams = hrefParams(screen.getByRole("link", { name: "หน้าถัดไป" }));
    expect(nextParams.get("historyPage")).toBe("4");
    expect(nextParams.get("page")).toBe("1");
  });

  it("ไม่ตัด rows ฝั่ง client แม้ DTO ส่งมามากกว่า pageSize", () => {
    const extra = Array.from({ length: 19 }, (_, index) => ({
      ...equipment[0],
      id: 100 + index,
      code: `EXTRA-${index + 1}`,
      name: index === 18 ? "รายการลำดับที่ยี่สิบเอ็ด" : `รายการเสริม ${index + 1}`,
    }));
    render(
      <EquipmentDashboard
        {...dashboard}
        equipment={[...equipment, ...extra]}
        filters={filters}
        today="2026-08-21"
        canManage={false}
      />,
    );

    expect(screen.getAllByText("รายการลำดับที่ยี่สิบเอ็ด")).toHaveLength(2);
  });
});
