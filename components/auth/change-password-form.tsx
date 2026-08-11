"use client";

import { useState, type FormEvent } from "react";
import { Check, Eye, EyeOff, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";

import { LogoutButton } from "@/components/auth/current-staff-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ChangePasswordResponse = { error?: string; returnTo?: string };

const POLICY_RULES = [
  "อย่างน้อย 12 ตัวอักษร",
  "มีตัวพิมพ์ใหญ่และตัวพิมพ์เล็ก",
  "มีตัวเลขอย่างน้อย 1 ตัว",
  "มีอักขระพิเศษอย่างน้อย 1 ตัว",
];

/** ช่วยตรวจ confirmation ฝั่ง client แต่ยังส่งให้ Route Handler ตรวจ policy และ session ซ้ำทุกครั้ง */
export function ChangePasswordForm() {
  const router = useRouter();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirmationError, setConfirmationError] = useState(false);

  /** ไม่เก็บ plaintext ใน React state และล้าง fields เมื่อ request จบ ไม่ว่าจะสำเร็จหรือผิดพลาด */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");

    setError("");
    if (password !== confirmation) {
      setConfirmationError(true);
      return;
    }

    setConfirmationError(false);
    setPending(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmation }),
      });
      const result = (await response.json()) as ChangePasswordResponse;
      if (!response.ok) {
        throw new Error(result.error ?? "ไม่สามารถเปลี่ยนรหัสผ่านได้ชั่วคราว");
      }

      form.reset();
      router.replace(result.returnTo ?? "/");
    } catch (changeError) {
      form.reset();
      setError(
        changeError instanceof Error
          ? changeError.message
          : "ไม่สามารถเปลี่ยนรหัสผ่านได้ชั่วคราว",
      );
      setPending(false);
    }
  }

  const status = confirmationError
    ? "รหัสผ่านยืนยันไม่ตรงกัน"
    : pending
      ? "กำลังบันทึกรหัสผ่าน..."
      : error
        ? `${error} กรุณาตรวจสอบกฎทั้งสี่แล้วลองอีกครั้ง`
        : "";

  return (
    <section className="w-full max-w-lg rounded-2xl border bg-card p-6 text-card-foreground shadow-xl shadow-primary/5 sm:p-8">
      <div className="mb-6">
        <span className="mb-5 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <KeyRound className="size-6" aria-hidden="true" />
        </span>
        <p className="mb-1 text-sm font-semibold text-primary">ความปลอดภัยบัญชี</p>
        <h1 id="change-password-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
          ตั้งรหัสผ่านใหม่
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          คุณต้องตั้งรหัสผ่านส่วนตัวก่อนเริ่มใช้งานระบบ
        </p>
      </div>

      <div id="password-policy" className="mb-6 rounded-xl border bg-muted/60 p-4">
        <p className="mb-3 text-sm font-semibold">รหัสผ่านต้องมี</p>
        <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          {POLICY_RULES.map((rule) => (
            <li key={rule} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </div>

      <form
        aria-labelledby="change-password-heading"
        aria-busy={pending}
        className="space-y-5"
        onSubmit={handleSubmit}
      >
        <div className="space-y-2">
          <Label htmlFor="new-password">รหัสผ่านใหม่</Label>
          <div className="relative">
            <Input
              id="new-password"
              name="password"
              type={passwordVisible ? "text" : "password"}
              autoComplete="new-password"
              minLength={12}
              required
              autoFocus
              disabled={pending}
              aria-invalid={error ? true : undefined}
              aria-describedby="password-policy change-password-status"
              className="pr-14"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 rounded-l-none"
              aria-label={passwordVisible ? "ซ่อนรหัสผ่านใหม่" : "แสดงรหัสผ่านใหม่"}
              aria-pressed={passwordVisible}
              disabled={pending}
              onClick={() => setPasswordVisible((visible) => !visible)}
            >
              {passwordVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password-confirmation">ยืนยันรหัสผ่านใหม่</Label>
          <div className="relative">
            <Input
              id="password-confirmation"
              name="confirmation"
              type={confirmationVisible ? "text" : "password"}
              autoComplete="new-password"
              minLength={12}
              required
              disabled={pending}
              aria-invalid={confirmationError || error ? true : undefined}
              aria-describedby="change-password-status"
              className="pr-14"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 rounded-l-none"
              aria-label={confirmationVisible ? "ซ่อนรหัสผ่านยืนยัน" : "แสดงรหัสผ่านยืนยัน"}
              aria-pressed={confirmationVisible}
              disabled={pending}
              onClick={() => setConfirmationVisible((visible) => !visible)}
            >
              {confirmationVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </Button>
          </div>
        </div>

        <p
          id="change-password-status"
          role="status"
          aria-live="polite"
          className={confirmationError || error ? "text-sm leading-5 text-destructive" : "min-h-5 text-sm text-muted-foreground"}
        >
          {status}
        </p>

        <Button type="submit" size="lg" className="h-12 w-full" disabled={pending}>
          <KeyRound className="size-5" aria-hidden="true" />
          {pending ? "กำลังบันทึกรหัสผ่าน" : "บันทึกรหัสผ่านใหม่"}
        </Button>
      </form>

      <div className="mt-6 border-t pt-5">
        <p className="mb-3 text-center text-xs text-muted-foreground">
          หากยังไม่พร้อมเปลี่ยนรหัสผ่าน คุณสามารถออกจากระบบได้
        </p>
        <LogoutButton />
      </div>
    </section>
  );
}
