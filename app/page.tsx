import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getDashboardData();
  return <DashboardPage initialData={data} />;
}
