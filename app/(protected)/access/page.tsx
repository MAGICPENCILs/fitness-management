import { ScanPage } from "@/components/access/scan-page";
import { getHardwareHealth } from "@/lib/hardware/adapter";
import { listAccessScanPoints, listRecentAccessScans } from "@/lib/access-service";
import { getCurrentBranchId } from "@/lib/branch-service";
import { requirePermission } from "@/lib/staff-service";

const scanTime = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

/** โหลดจุดและประวัติเฉพาะสาขาที่พนักงานมีสิทธิ์สแกน โดยไม่ส่งรหัสบัตรไปที่หน้าเว็บ */
export default async function AccessPage() {
  const branchId = await getCurrentBranchId();
  await requirePermission("access.manage", branchId);
  const [scanPoints, recent] = await Promise.all([listAccessScanPoints(branchId), listRecentAccessScans(branchId)]);
  return (
    <ScanPage key={branchId} hardwareHealth={getHardwareHealth()} scanPoints={scanPoints}>
      <section aria-labelledby="recent-access-title" className="rounded-xl border bg-card p-4 sm:p-6">
        <h2 id="recent-access-title" className="text-lg font-semibold">ประวัติการสแกนล่าสุด</h2>
        <p className="mt-1 text-sm text-muted-foreground">สูงสุด 20 รายการในสาขานี้ · เวลาไทย</p>
        {recent.length ? (
          <ul className="mt-3 divide-y">
            {recent.map(row => (
              <li key={row.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                <div className="min-w-0 break-words">
                  <p className="font-medium">{row.point ?? "ไม่ระบุจุด"}</p>
                  <p className="text-muted-foreground">{row.scannedAt ? scanTime.format(row.scannedAt) : "ไม่ระบุเวลา"}</p>
                </div>
                <span className={row.result === "APPROVED" ? "shrink-0 text-success" : "shrink-0 text-destructive"}>
                  {row.result === "APPROVED" ? "อนุมัติ" : "ปฏิเสธ"}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm text-muted-foreground">ยังไม่มีประวัติการสแกน</p>}
      </section>
    </ScanPage>
  );
}
