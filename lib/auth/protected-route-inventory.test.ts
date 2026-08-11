import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const GUARDED_SERVICE_CALLS = [
  "getStaffDashboard",
  "setCurrentBranchCookie",
  "setCurrentStaffCookie",
] as const;

/** เดินหา route.ts ทั้งหมดแบบ deterministic เพื่อไม่ให้ API ใหม่หลุดจาก authoritative guard โดยไม่ถูกตรวจ */
function listRouteFiles(directory: string): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      return entry.isDirectory() ? listRouteFiles(fullPath) : [fullPath];
    })
    .filter((file) => file.endsWith(`${path.sep}route.ts`))
    .sort();
}

/** แยก exported HTTP method เป็น block เพื่อให้ mixed-method file ต้องมี guard ในแต่ละ method จริง */
function exportedMethodBlocks(source: string) {
  const matches = [
    ...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)/g),
  ];
  return matches.map((match, index) => ({
    method: match[1],
    block: source.slice(
      match.index,
      matches[index + 1]?.index ?? source.length,
    ),
  }));
}

describe("protected API inventory", () => {
  it("keeps every non-auth Route Handler behind an authoritative session or permission boundary", () => {
    const apiRoot = path.join(process.cwd(), "app", "api");
    const unguarded: string[] = [];

    for (const file of listRouteFiles(apiRoot)) {
      if (file.includes(`${path.sep}api${path.sep}auth${path.sep}`)) continue;
      const source = fs.readFileSync(file, "utf8");
      for (const { method, block } of exportedMethodBlocks(source)) {
        const relative = path.relative(process.cwd(), file).replaceAll("\\", "/");
        const dashboardFullSession =
          relative === "app/api/dashboard/route.ts" &&
          block.includes("getCurrentBranchId");
        const guarded =
          block.includes("requirePermission") ||
          block.includes("requireFullSession") ||
          GUARDED_SERVICE_CALLS.some((call) => block.includes(call)) ||
          dashboardFullSession;
        if (!guarded) unguarded.push(`${relative}:${method}`);
      }
    }

    expect(unguarded).toEqual([]);
  });
});
