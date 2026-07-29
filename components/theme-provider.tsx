"use client";

import type { ComponentProps } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/** เชื่อม theme ระดับแอปกับ class บนเอกสาร เพื่อให้ทุกหน้าใช้ token ชุดเดียวกัน */
export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props} />;
}
