import type { Metadata } from "next";
import { SignupForm } from "@/components/member-portal/signup-form";
import { getPublicBranches } from "@/lib/member-portal-service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "สมัครสมาชิก | Fitness Pro", description: "ส่งใบสมัครสมาชิก Fitness Pro ออนไลน์" };

/** โหลดเฉพาะชื่อสาขาที่เปิดใช้สำหรับแบบฟอร์มสาธารณะ */
export default async function SignupPage() {
  return <main className="min-h-screen bg-gradient-to-br from-background via-background to-accent/40 p-4 py-10"><SignupForm branches={await getPublicBranches()} /></main>;
}
