import { ScanPage } from "@/components/access/scan-page";
import { getHardwareHealth } from "@/lib/hardware/adapter";

export default function AccessPage() {
  return <ScanPage hardwareHealth={getHardwareHealth()} />;
}
