import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("workforce migration", () => {
  it("keeps MySQL identifiers within the 64-character limit", () => {
    const migration = readFileSync("drizzle/0016_add_staff_workforce.sql", "utf8");
    const identifiers = [...migration.matchAll(/`([^`]+)`/g)].map((match) => match[1]);

    expect(identifiers.length).toBeGreaterThan(0);
    expect(identifiers.filter((name) => [...name].length > 64)).toEqual([]);
  });
});
