"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

/** สลับระหว่างโหมดสว่างและมืด โดย next-themes จะจดจำค่าที่ผู้ใช้เลือกไว้ */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="relative size-11 shrink-0 bg-card"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="สลับโหมดสี"
      title="สลับโหมดสว่างและมืด"
    >
      <Sun className="size-5 rotate-0 scale-100 transition-transform duration-200 dark:-rotate-90 dark:scale-0" aria-hidden="true" />
      <Moon className="absolute size-5 rotate-90 scale-0 transition-transform duration-200 dark:rotate-0 dark:scale-100" aria-hidden="true" />
    </Button>
  );
}
