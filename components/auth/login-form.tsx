"use client";

import { useState, type FormEvent } from "react";
import { Dumbbell, Eye, EyeOff, LogIn } from "lucide-react";

import { readAuthClientResponse } from "@/components/auth/auth-client-response";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LOGIN_UNAVAILABLE_MESSAGE = "ไม่สามารถเข้าสู่ระบบได้ชั่วคราว";

/** ส่ง credential ไปยัง Route Handler เท่านั้น ล้างสถานะรหัสผ่าน และ reload เอกสารหลังสำเร็จเพื่อให้ request ถัดไปอ่าน session cookie ใหม่แน่นอน */
export function LoginForm({ returnTo }: { returnTo: string }) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  /** ใช้ FormData แบบ uncontrolled เพื่อให้ plaintext อยู่เฉพาะ DOM ระหว่างที่ผู้ใช้กรอกและตอนส่ง request */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffCode: String(formData.get("staffCode") ?? ""),
          password: String(formData.get("password") ?? ""),
          returnTo,
        }),
      });
      const result = await readAuthClientResponse(response);
      if (!response.ok || !result) {
        form.reset();
        setError(result?.error ?? LOGIN_UNAVAILABLE_MESSAGE);
        setPending(false);
        return;
      }

      form.reset();
      globalThis.location.replace(result.returnTo ?? "/");
    } catch {
      form.reset();
      setError(LOGIN_UNAVAILABLE_MESSAGE);
      setPending(false);
    }
  }

  return (
    <section className="w-full max-w-md rounded-2xl border bg-card p-6 text-card-foreground shadow-xl shadow-primary/5 sm:p-8">
      <div className="mb-7">
        <span className="mb-5 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Dumbbell className="size-6" aria-hidden="true" />
        </span>
        <p className="mb-1 text-sm font-semibold text-primary">Fitness Pro</p>
        <h1 id="login-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
          เข้าสู่ระบบ
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          ใช้รหัสพนักงานและรหัสผ่านของคุณเพื่อจัดการงานประจำวัน
        </p>
      </div>

      <form
        aria-labelledby="login-heading"
        aria-busy={pending}
        className="space-y-5"
        onSubmit={handleSubmit}
      >
        <input
          data-testid="login-return-to"
          type="hidden"
          name="returnTo"
          value={returnTo}
        />
        <div className="space-y-2">
          <Label htmlFor="staff-code">รหัสพนักงาน</Label>
          <Input
            id="staff-code"
            name="staffCode"
            autoComplete="username"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={20}
            required
            autoFocus
            disabled={pending}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-status" : undefined}
            placeholder="เช่น OWNER001"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="login-password">รหัสผ่าน</Label>
          <div className="relative">
            <Input
              id="login-password"
              name="password"
              type={passwordVisible ? "text" : "password"}
              autoComplete="current-password"
              required
              disabled={pending}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "login-status" : undefined}
              className="pr-14"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 rounded-l-none"
              aria-label={passwordVisible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
              aria-pressed={passwordVisible}
              disabled={pending}
              onClick={() => setPasswordVisible((visible) => !visible)}
            >
              {passwordVisible ? (
                <EyeOff className="size-5" aria-hidden="true" />
              ) : (
                <Eye className="size-5" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>

        <p
          id="login-status"
          role="status"
          aria-live="polite"
          className={error ? "text-sm leading-5 text-destructive" : "min-h-5 text-sm text-muted-foreground"}
        >
          {pending
            ? "กำลังตรวจสอบข้อมูล..."
            : error
              ? `${error} กรุณาตรวจสอบข้อมูลแล้วลองอีกครั้ง`
              : ""}
        </p>

        <Button type="submit" size="lg" className="h-12 w-full" disabled={pending}>
          <LogIn className="size-5" aria-hidden="true" />
          {pending ? "กำลังเข้าสู่ระบบ" : "เข้าสู่ระบบ"}
        </Button>
      </form>
    </section>
  );
}
