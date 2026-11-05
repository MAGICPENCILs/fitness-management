import type { Metadata } from "next";
import { MemberLoginForm } from "@/components/member-portal/member-login-form";
export const metadata: Metadata = { title: "เข้าสู่ระบบสมาชิก | Fitness Pro" };
export default function MemberLoginPage() { return <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-accent/40 p-4"><MemberLoginForm /></main>; }
