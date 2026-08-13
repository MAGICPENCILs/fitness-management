import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSafeReturnPath } from "@/lib/auth/request-security";
import { getOptionalSession } from "@/lib/auth/session-service";

type LoginPageProps = {
  searchParams: Promise<{ returnTo?: string | string[] }>;
};

/** ใช้ authoritative DB session ตัดสิน auth page เพื่อให้ cookie เก่าหรือถูก revoke ไม่เกิด redirect loop */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getOptionalSession();
  if (session?.mode === "FULL") redirect("/");
  if (session?.mode === "PASSWORD_CHANGE_REQUIRED") {
    redirect("/change-password");
  }

  const rawReturnTo = (await searchParams).returnTo;
  const returnTo = getSafeReturnPath(
    Array.isArray(rawReturnTo) ? rawReturnTo[0] : rawReturnTo,
  );

  return (
    <main className="relative flex min-h-dvh w-full overflow-x-hidden bg-background px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_42%)]" aria-hidden="true" />
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>
      <div className="relative z-0 m-auto w-full max-w-md pt-12 sm:pt-0">
        <LoginForm returnTo={returnTo} />
        <p className="mt-5 text-center text-xs text-muted-foreground">
          Fitness Pro Management System
        </p>
      </div>
    </main>
  );
}
