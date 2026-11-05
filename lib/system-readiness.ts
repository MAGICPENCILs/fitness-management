import { sql } from "drizzle-orm";

import { db } from "@/db";
import migrationJournal from "@/drizzle/meta/_journal.json";

const requiredEntry = migrationJournal.entries.at(-1);

if (!requiredEntry) {
  throw new Error("Migration journal is empty");
}

export const REQUIRED_MIGRATION = {
  createdAt: requiredEntry.when,
  tag: requiredEntry.tag,
} as const;

export type SystemReadiness = {
  status: "READY" | "OUTDATED" | "UNAVAILABLE";
  requiredMigration: string;
};

type LatestMigrationReader = () => Promise<number | null>;

export class SchemaNotReadyError extends Error {
  constructor() {
    super("Schema is not ready");
    this.name = "SchemaNotReadyError";
  }
}

/** อ่านเฉพาะรุ่น migration ล่าสุด โดยไม่ดึง SQL หรือข้อมูลเชื่อมต่อออกจากฐานข้อมูล */
async function readLatestAppliedMigration(): Promise<number | null> {
  const [rows] = await db.execute<{ latestCreatedAt: number | string | null }>(
    sql`SELECT MAX(created_at) AS latestCreatedAt FROM __drizzle_migrations`,
  );
  const value = rows[0]?.latestCreatedAt;
  return value === null || value === undefined ? null : Number(value);
}

/** แยกกรณียังไม่มี migration journal ออกจากปัญหาการเชื่อมต่อ โดยไม่เผยรายละเอียด error ภายใน */
function isMissingJournal(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ER_NO_SUCH_TABLE",
  );
}

/** เทียบ migration journal กับรุ่นที่โค้ดต้องการ และลดรายละเอียดความล้มเหลือให้เหลือสถานะที่เปิดเผยได้ */
export async function getSystemReadiness(
  readLatestMigration: LatestMigrationReader = readLatestAppliedMigration,
): Promise<SystemReadiness> {
  try {
    const latestCreatedAt = await readLatestMigration();
    return {
      status:
        latestCreatedAt !== null &&
        latestCreatedAt >= REQUIRED_MIGRATION.createdAt
          ? "READY"
          : "OUTDATED",
      requiredMigration: REQUIRED_MIGRATION.tag,
    };
  } catch (error) {
    return {
      status: isMissingJournal(error) ? "OUTDATED" : "UNAVAILABLE",
      requiredMigration: REQUIRED_MIGRATION.tag,
    };
  }
}

/** หยุดงานที่ต้องพึ่ง schema ก่อนแตะข้อมูลธุรกิจ เพื่อไม่ให้เกิด side effect บางส่วนเมื่อฐานข้อมูลยังไม่พร้อม */
export async function assertSchemaReady(
  readLatestMigration?: LatestMigrationReader,
): Promise<void> {
  const readiness = await getSystemReadiness(readLatestMigration);
  if (readiness.status !== "READY") {
    throw new SchemaNotReadyError();
  }
}
