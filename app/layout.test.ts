import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("root layout font loading", () => {
  it("uses the local CSS sans stack without a build-time Google Fonts request", () => {
    const layoutSource = fs.readFileSync(
      path.join(process.cwd(), "app", "layout.tsx"),
      "utf8",
    );
    const globalCss = fs.readFileSync(
      path.join(process.cwd(), "app", "globals.css"),
      "utf8",
    );

    expect(layoutSource).not.toContain("next/font/google");
    expect(globalCss).toContain('--font-sans: "Inter", sans-serif;');
    expect(globalCss).toContain("font-family: var(--font-sans);");
  });
});
