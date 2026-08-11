import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { getDashboardData } from "@/lib/dashboard-data";
import { getCurrentBranchId } from "@/lib/branch-service";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getDashboardData(await getCurrentBranchId());
  return <DashboardPage initialData={data} />;
}
