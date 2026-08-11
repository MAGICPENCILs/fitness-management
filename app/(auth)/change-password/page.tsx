import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { getOptionalSession } from "@/lib/auth/session-service";

/** อนุญาตเฉพาะ authoritative forced session; FULL และ invalid session ออกจากหน้าโดยไม่ render application Sidebar */
export default async function ChangePasswordPage() {
  const session = await getOptionalSession();
  if (!session) redirect("/login");
  if (session.mode === "FULL") redirect("/");

  return (
    <main className="relative flex min-h-dvh w-full overflow-x-hidden bg-background px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_42%)]" aria-hidden="true" />
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>
      <div className="relative z-0 m-auto w-full max-w-lg pt-12 sm:pt-0">
        <ChangePasswordForm />
      </div>
    </main>
  );
}
