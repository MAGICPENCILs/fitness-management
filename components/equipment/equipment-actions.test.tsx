// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EquipmentDashboard } from "@/components/equipment/equipment-dashboard";
import { EquipmentDetailDialog } from "@/components/equipment/equipment-detail-dialog";
import { EquipmentFormDialog } from "@/components/equipment/equipment-form-dialog";
import { EquipmentMaintenanceDialog } from "@/components/equipment/equipment-maintenance-dialog";
import { EquipmentOperationDialog } from "@/components/equipment/equipment-operation-dialog";
import { EquipmentRetireDialog } from "@/components/equipment/equipment-retire-dialog";
import { readEquipmentClientResponse } from "@/components/equipment/equipment-client-response";
import type { EquipmentDashboardFilters, EquipmentDto } from "@/lib/equipment-service";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

Object.defineProperties(HTMLElement.prototype, {
  hasPointerCapture: { value: () => false },
  setPointerCapture: { value: () => undefined },
  releasePointerCapture: { value: () => undefined },
  scrollIntoView: { value: () => undefined },
});

const item: EquipmentDto = {
  id: 7,
  code: "BIKE-007",
  name: "จักรยานสปิน",
  category: "CARDIO",
  location: "โซน A",
  serialNumber: "SN-SAFE-007",
  status: "OPERATIONAL",
  retiredAt: null,
  retiredReason: null,
  version: 4,
  purchaseDate: "2025-01-10",
  warrantyEndDate: "2027-01-10",
  currentUsageHours: 100,
  maintenanceIntervalHours: 200,
  nextMaintenanceHours: 300,
  nextMaintenanceDate: "2026-09-01",
  lastMaintenanceDate: "2026-01-10",
  note: "หมายเหตุที่อนุญาต",
  maintenanceState: "SCHEDULED",
  remainingHours: 200,
  remainingDays: 11,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
};

const filters: EquipmentDashboardFilters = {
  search: "",
  status: "ALL",
  category: "ALL",
  maintenance: "ALL",
  tab: "equipment",
  page: 1,
  historyPage: 1,
  pageSize: 20,
  historyEquipmentId: null,
  historyType: "ALL",
  historyStatus: "ALL",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  navigation.refresh.mockReset();
  vi.restoreAllMocks();
});

afterEach(() => cleanup());

describe("equipment action visibility", () => {
  it("ให้ผู้ใช้อ่านอย่างเดียวเปิดรายละเอียดได้ แต่ไม่ render management controls", () => {
    render(<EquipmentDashboard summary={{ total: 1, operational: 1, maintenance: 0, outOfService: 0, retired: 0, overdue: 0, dueSoon: 0 }} equipment={[item]} history={[]} equipmentPagination={{ page: 1, pageSize: 20, total: 1, totalPages: 1 }} historyPagination={{ page: 1, pageSize: 20, total: 0, totalPages: 0 }} filters={filters} today="2026-08-21" canManage={false} />);
    expect(screen.getAllByRole("button", { name: /ดูรายละเอียด BIKE-007/ })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "เพิ่มอุปกรณ์" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /แก้ไขทะเบียน BIKE-007/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /เลิกใช้งาน BIKE-007/ })).not.toBeInTheDocument();
  });

  it("แสดง management controls ให้ผู้มีสิทธิ์ แต่ RETIRED เหลือเฉพาะรายละเอียด", () => {
    render(<EquipmentDashboard summary={{ total: 2, operational: 1, maintenance: 0, outOfService: 0, retired: 1, overdue: 0, dueSoon: 0 }} equipment={[item, { ...item, id: 8, code: "OLD-008", status: "RETIRED", retiredAt: "2026-08-01T00:00:00.000Z", retiredReason: "ชำรุด", version: 9 }]} history={[]} equipmentPagination={{ page: 1, pageSize: 20, total: 2, totalPages: 1 }} historyPagination={{ page: 1, pageSize: 20, total: 0, totalPages: 0 }} filters={filters} today="2026-08-21" canManage />);
    expect(screen.getByRole("button", { name: "เพิ่มอุปกรณ์" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: /แก้ไขทะเบียน BIKE-007/ })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /แก้ไขทะเบียน OLD-008/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /บันทึกงานบำรุง OLD-008/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /เลิกใช้งาน OLD-008/ })).not.toBeInTheDocument();
  });
});

describe("create and edit equipment", () => {
  it("ผูก date error กับ field และไม่ส่ง request เมื่อ warranty ก่อน purchase", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<EquipmentFormDialog onSuccess={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "เพิ่มอุปกรณ์" }));
    await user.type(screen.getByLabelText("รหัสอุปกรณ์"), "bike-009");
    await user.type(screen.getByLabelText("ชื่ออุปกรณ์"), "จักรยานใหม่");
    await user.type(screen.getByLabelText("ตำแหน่ง"), "โซน B");
    fireEvent.change(screen.getByLabelText("วันที่ซื้อ"), { target: { value: "2026-08-20" } });
    fireEvent.change(screen.getByLabelText("วันสิ้นสุดประกัน"), { target: { value: "2026-08-19" } });
    await user.click(screen.getByRole("button", { name: "บันทึกอุปกรณ์" }));
    const warranty = screen.getByLabelText("วันสิ้นสุดประกัน");
    expect(warranty).toHaveAttribute("aria-invalid", "true");
    expect(warranty).toHaveAttribute("aria-describedby", "equipment-warranty-error");
    expect(screen.getByText("วันสิ้นสุดประกันต้องไม่ก่อนวันที่ซื้อ")).toHaveAttribute("id", "equipment-warranty-error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POST create ครั้งเดียวระหว่าง pending แล้วปิด ประกาศ และ refresh เมื่อสำเร็จ", async () => {
    const user = userEvent.setup();
    const deferred = deferredResponse();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(deferred.promise);
    const success = vi.fn();
    render(<EquipmentFormDialog onSuccess={success} />);
    await user.click(screen.getByRole("button", { name: "เพิ่มอุปกรณ์" }));
    await user.type(screen.getByLabelText("รหัสอุปกรณ์"), "bike-009");
    await user.type(screen.getByLabelText("ชื่ออุปกรณ์"), "จักรยานใหม่");
    await user.type(screen.getByLabelText("ตำแหน่ง"), "โซน B");
    const submit = screen.getByRole("button", { name: "บันทึกอุปกรณ์" });
    await user.click(submit);
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/equipment", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toMatchObject({ code: "BIKE-009", name: "จักรยานใหม่", currentUsageHours: 0 });
    deferred.resolve(jsonResponse({ message: "SERVER-RAW-DO-NOT-RENDER", id: 9, version: 1 }, 201));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(success).toHaveBeenCalledWith("เพิ่มอุปกรณ์เรียบร้อยแล้ว");
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });

  it("PUT edit ส่ง expectedVersion และคืน focus เมื่อกด Escape", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ message: "ok", version: 5 }));
    render(<EquipmentFormDialog item={item} onSuccess={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "แก้ไขทะเบียน BIKE-007" });
    await user.click(trigger);
    await user.clear(screen.getByLabelText("ชื่ออุปกรณ์"));
    await user.type(screen.getByLabelText("ชื่ออุปกรณ์"), "จักรยานปรับปรุง");
    await user.click(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(fetchMock.mock.calls[0][0]).toBe("/api/equipment/7");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toMatchObject({ expectedVersion: 4, name: "จักรยานปรับปรุง" });

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });
});

describe("operation, maintenance and retirement", () => {
  it("PATCH operation จำกัดสถานะ ส่งมิเตอร์และ expectedVersion", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ version: 5 }));
    render(<EquipmentOperationDialog item={item} onSuccess={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "อัปเดตมิเตอร์และสถานะ BIKE-007" }));
    expect(screen.queryByRole("option", { name: "เลิกใช้งาน" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "บันทึกสถานะ" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({ currentUsageHours: 100, status: "OPERATIONAL", expectedVersion: 4 });
  });

  it("POST maintenance ส่งข้อมูล completed/meter/version ครบ", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ id: 50, version: 5 }, 201));
    render(<EquipmentMaintenanceDialog item={item} today="2026-08-21" onSuccess={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "บันทึกงานบำรุง BIKE-007" }));
    expect(screen.getByLabelText("ประเภทงาน")).toBeVisible();
    expect(screen.getByLabelText("สถานะงาน")).toBeVisible();
    expect(screen.getByText(/การบันทึกงานที่เสร็จแล้ว/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "บันทึกงานบำรุง" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/equipment/7/maintenance");
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toMatchObject({ status: "COMPLETED", scheduledDate: "2026-08-21", completedDate: "2026-08-21", usageHoursAtService: 100, expectedVersion: 4 });
  });

  it("ผูกวันที่เสร็จก่อนวันนัดหมายกับ field error และไม่ส่ง maintenance", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<EquipmentMaintenanceDialog item={item} today="2026-08-21" onSuccess={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "บันทึกงานบำรุง BIKE-007" }));
    fireEvent.change(screen.getByLabelText("วันที่เสร็จงาน"), { target: { value: "2026-08-20" } });
    await user.click(screen.getByRole("button", { name: "บันทึกงานบำรุง" }));
    const completed = screen.getByLabelText("วันที่เสร็จงาน");
    expect(completed).toHaveAttribute("aria-invalid", "true");
    expect(completed).toHaveAttribute("aria-describedby", "maintenance-completed-error-7");
    expect(screen.getByText("วันที่เสร็จต้องไม่ก่อนวันที่นัดหมาย")).toHaveAttribute("id", "maintenance-completed-error-7");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retirement แสดงผลถาวร บังคับเหตุผล และส่ง expectedVersion", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ version: 5 }));
    render(<EquipmentRetireDialog item={item} onSuccess={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "เลิกใช้งาน BIKE-007" }));
    expect(screen.getByText(/ไม่สามารถนำกลับมาใช้งานหรือบันทึกงานบำรุงต่อได้/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "ยืนยันเลิกใช้งาน" }));
    expect(screen.getByLabelText("เหตุผลที่เลิกใช้งาน")).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("เหตุผลที่เลิกใช้งาน"), "ชำรุดถาวร");
    await user.click(screen.getByRole("button", { name: "ยืนยันเลิกใช้งาน" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/equipment/7/retire");
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({ reason: "ชำรุดถาวร", expectedVersion: 4 });
  });
});

describe("fixed response handling", () => {
  it("อ่านเฉพาะ expected JSON keys และคืน null สำหรับ HTML/malformed", async () => {
    await expect(readEquipmentClientResponse(jsonResponse({ message: "x", error: "y", version: 2, token: "SECRET" }))).resolves.toEqual({ message: "x", error: "y", version: 2 });
    await expect(readEquipmentClientResponse(new Response("<html>SQL TOKEN HASH IP</html>", { status: 500, headers: { "content-type": "text/html" } }))).resolves.toBeNull();
    await expect(readEquipmentClientResponse(new Response("{", { status: 500, headers: { "content-type": "application/json" } }))).resolves.toBeNull();
  });

  it.each([
    [400, "ข้อมูลอัปเดตสถานะไม่ถูกต้อง กรุณาตรวจสอบช่องที่กรอก"],
    [404, "ไม่พบอุปกรณ์ที่ต้องการอัปเดตสถานะ"],
    [500, "ไม่สามารถอัปเดตสถานะอุปกรณ์ได้ชั่วคราว กรุณาลองใหม่"],
  ])("แสดง fixed copy สำหรับ HTTP %s โดยไม่สะท้อน arbitrary body", async (status, copy) => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "SQL TOKEN HASH RAW-IP SENTINEL" }, status));
    render(<EquipmentOperationDialog item={item} onSuccess={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "อัปเดตมิเตอร์และสถานะ BIKE-007" }));
    await user.click(screen.getByRole("button", { name: "บันทึกสถานะ" }));
    expect(await screen.findByText(copy)).toBeVisible();
    expect(screen.queryByText(/SQL TOKEN HASH RAW-IP SENTINEL/)).not.toBeInTheDocument();
  });

  it("409 ปิด dialog ประกาศ exact copy refresh ครั้งเดียวและไม่ retry", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "STALE-SERVER-RAW" }, 409));
    const success = vi.fn();
    render(<EquipmentOperationDialog item={item} onSuccess={success} />);
    await user.click(screen.getByRole("button", { name: "อัปเดตมิเตอร์และสถานะ BIKE-007" }));
    await user.click(screen.getByRole("button", { name: "บันทึกสถานะ" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(success).toHaveBeenCalledWith("ข้อมูลถูกแก้ไขแล้ว กรุณาตรวจสอบข้อมูลล่าสุด");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });

  it.each([[401, "/login"], [403, "/forbidden"]])("HTTP %s hard-navigate ไปหน้าปลอดภัยโดยไม่สะท้อน body", async (status, destination) => {
    const user = userEvent.setup();
    const replace = vi.fn();
    const originalLocation = globalThis.location;
    vi.stubGlobal("location", { ...originalLocation, replace });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "SQL TOKEN HASH RAW-IP" }, status));
    render(<EquipmentOperationDialog item={item} onSuccess={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "อัปเดตมิเตอร์และสถานะ BIKE-007" }));
    await user.click(screen.getByRole("button", { name: "บันทึกสถานะ" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(destination));
    expect(screen.queryByText(/SQL TOKEN HASH RAW-IP/)).not.toBeInTheDocument();
    expect(navigation.refresh).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it.each([
    [new Response("", { status: 500 }), "empty"],
    [new Response("<html>SQL TOKEN HASH RAW-IP</html>", { status: 500, headers: { "content-type": "text/html" } }), "html"],
    [new Response("{", { status: 500, headers: { "content-type": "application/json" } }), "malformed"],
  ])("ใช้ fixed copy กับ %s response", async (response) => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    render(<EquipmentOperationDialog item={item} onSuccess={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "อัปเดตมิเตอร์และสถานะ BIKE-007" }));
    await user.click(screen.getByRole("button", { name: "บันทึกสถานะ" }));
    expect(await screen.findByText("ไม่สามารถอัปเดตสถานะอุปกรณ์ได้ชั่วคราว กรุณาลองใหม่")).toBeVisible();
    expect(screen.queryByText(/SQL TOKEN HASH RAW-IP/)).not.toBeInTheDocument();
  });

  it("ใช้ fixed copy เมื่อ network rejected", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("SQL TOKEN HASH RAW-IP"));
    render(<EquipmentOperationDialog item={item} onSuccess={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "อัปเดตมิเตอร์และสถานะ BIKE-007" }));
    await user.click(screen.getByRole("button", { name: "บันทึกสถานะ" }));
    expect(await screen.findByText("ไม่สามารถอัปเดตสถานะอุปกรณ์ได้ชั่วคราว กรุณาลองใหม่")).toBeVisible();
  });
});

describe("equipment detail", () => {
  it("แสดง pending แล้ว safe DTO/history โดยไม่เปิดเผย field นอก contract", async () => {
    const user = userEvent.setup();
    const deferred = deferredResponse();
    vi.spyOn(globalThis, "fetch").mockReturnValue(deferred.promise);
    render(<EquipmentDetailDialog item={item} />);
    await user.click(screen.getByRole("button", { name: "ดูรายละเอียด BIKE-007" }));
    expect(screen.getByRole("status")).toHaveTextContent("กำลังโหลดรายละเอียด");
    deferred.resolve(jsonResponse({ equipment: item, history: [{ id: 1, equipmentId: 7, equipmentCode: "BIKE-007", equipmentName: "จักรยานสปิน", type: "REPAIR", status: "COMPLETED", scheduledDate: "2026-08-20", completedDate: "2026-08-21", usageHoursAtService: 100, cost: 50, technician: "ช่างเอ", note: "PRIVATE-HISTORY-NOTE", createdAt: null }], historyPagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 }, token: "SECRET" }));
    expect(await screen.findByText("SN-SAFE-007")).toBeVisible();
    expect(screen.getByText("ซ่อมแซม")).toBeVisible();
    expect(screen.queryByText("PRIVATE-HISTORY-NOTE")).not.toBeInTheDocument();
    expect(screen.queryByText("SECRET")).not.toBeInTheDocument();
  });

  it("แสดง fixed detail error สำหรับ arbitrary/non-JSON body", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("SQL TOKEN HASH RAW-IP", { status: 500 }));
    render(<EquipmentDetailDialog item={item} />);
    await user.click(screen.getByRole("button", { name: "ดูรายละเอียด BIKE-007" }));
    expect(await screen.findByText("ไม่สามารถโหลดรายละเอียดอุปกรณ์ได้ชั่วคราว กรุณาลองใหม่")).toBeVisible();
    expect(within(screen.getByRole("dialog")).queryByText(/SQL TOKEN HASH RAW-IP/)).not.toBeInTheDocument();
  });

  it("ปฏิเสธ JSON detail ที่มี identity แต่ DTO ไม่ครบโดยไม่ทำให้ dialog crash", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ equipment: { id: 7, code: "BIKE-007", name: "SQL TOKEN HASH RAW-IP", version: 4 }, history: [], historyPagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }));
    render(<EquipmentDetailDialog item={item} />);
    await user.click(screen.getByRole("button", { name: "ดูรายละเอียด BIKE-007" }));
    expect(await screen.findByText("ไม่สามารถโหลดรายละเอียดอุปกรณ์ได้ชั่วคราว กรุณาลองใหม่")).toBeVisible();
    expect(screen.queryByText(/SQL TOKEN HASH RAW-IP/)).not.toBeInTheDocument();
  });
});
