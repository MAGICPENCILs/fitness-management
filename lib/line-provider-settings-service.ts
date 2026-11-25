import "server-only";
import { and, eq, gt, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { lineProviderSettings as settings, memberLineLinks as links, notifications } from "@/db/schema";
import { writeAudit, type DbTransaction } from "@/lib/audit-service";
import { isLineUserId } from "@/lib/line-link-policy";
import { hasPermission, type ActorContext } from "@/lib/rbac";
import { assertProviderConfigKey, decryptProviderCredential, encryptProviderCredential } from "@/lib/provider-credentials-crypto";

type Row = typeof settings.$inferSelect;
export type LineProviderSettingsDto = {
  source: "DATABASE" | "ENVIRONMENT" | "NONE";
  revision: number;
  destination: string | null;
  accessTokenConfigured: boolean;
  channelSecretConfigured: boolean;
  updatedAt: string | null;
  webhookUrl: string;
  outboundEnabled: false;
};

const messages = {
  400: "ข้อมูลการตั้งค่า LINE ไม่ถูกต้อง",
  403: "บัญชีนี้ไม่มีสิทธิ์ดำเนินการ",
  409: "ข้อมูลมีการเปลี่ยนแปลงหรือยังมีรายการที่ผูกกับ LINE เดิม",
  503: "การตั้งค่า LINE ยังไม่พร้อมใช้งาน",
} as const;
export class LineProviderSettingsError extends Error {
  /** ใช้ข้อความคงที่เพื่อไม่ส่ง validation, SQL หรือ crypto error ไปยัง browser */
  constructor(public readonly status: keyof typeof messages) { super(messages[status]); }
}

const credential = z.string().min(1).max(4096).refine(value =>
  Buffer.byteLength(value) <= 4096 && !/[\s\p{Cc}\p{Cf}\p{Cs}]/u.test(value));
const patch = z.strictObject({
  revision: z.number().int().min(0).max(0x7fffffff),
  destination: z.string().refine(isLineUserId).optional(),
  accessToken: credential.optional(), channelSecret: credential.optional(),
  clearAccessToken: z.literal(true).optional(), clearChannelSecret: z.literal(true).optional(),
}).refine(input => !(input.accessToken && input.clearAccessToken) && !(input.channelSecret && input.clearChannelSecret)
  && !!(input.destination || input.accessToken || input.channelSecret || input.clearAccessToken || input.clearChannelSecret));

/** ตรวจสิทธิ์ซ้ำที่ service เพราะหน้า Settings เรียกตรงได้โดยไม่ผ่าน route */
function requireOwner(actor: ActorContext) {
  if (!hasPermission(actor, "provider.credentials.manage")) throw new LineProviderSettingsError(403);
}

/** ต้องตรวจทั้งสอง field ก่อนใช้ DB row เพื่อไม่ให้หมุนบาง field ขณะ key หรือข้อมูลเดิมเสีย */
function readDatabaseCredentials(row: Row) {
  const key = process.env.PROVIDER_CONFIG_ENCRYPTION_KEY;
  assertProviderConfigKey(key);
  if (!isLineUserId(row.destination)) throw new LineProviderSettingsError(503);
  const accessToken = row.accessTokenEncrypted === null ? null : decryptProviderCredential(row.accessTokenEncrypted, "accessToken", key);
  const channelSecret = row.channelSecretEncrypted === null ? null : decryptProviderCredential(row.channelSecretEncrypted, "channelSecret", key);
  if ((accessToken !== null && !credential.safeParse(accessToken).success) || (channelSecret !== null && !credential.safeParse(channelSecret).success)) {
    throw new LineProviderSettingsError(503);
  }
  return { accessToken, channelSecret, destination: row.destination };
}

/** สร้าง URL จาก origin ที่ตั้งไว้เท่านั้น ไม่ใช้ Host หรือค่าใดจากคำขอ */
function webhookUrl() {
  const origin = process.env.APP_ORIGIN;
  if (!origin || !/^https?:\/\//.test(origin) || new URL(origin).origin !== origin) throw new LineProviderSettingsError(503);
  return `${origin}/api/line/webhook`;
}

/** สร้าง DTO แบบ allowlist โดยไม่กระจาย row, secret หรือ ciphertext ไปหน้าเว็บ */
function safeDto(row?: Pick<Row, "destination" | "accessTokenEncrypted" | "channelSecretEncrypted" | "revision" | "updatedAt">): LineProviderSettingsDto {
  const destination = row ? row.destination : process.env.NOTIFICATION_LINE_DESTINATION || null;
  if (destination !== null && !isLineUserId(destination)) throw new LineProviderSettingsError(503);
  const accessTokenConfigured = row ? row.accessTokenEncrypted !== null : !!process.env.NOTIFICATION_LINE_ACCESS_TOKEN;
  const channelSecretConfigured = row ? row.channelSecretEncrypted !== null : !!process.env.NOTIFICATION_LINE_CHANNEL_SECRET;
  return {
    source: row ? "DATABASE" : destination || accessTokenConfigured || channelSecretConfigured ? "ENVIRONMENT" : "NONE",
    destination, revision: row?.revision ?? 0, accessTokenConfigured, channelSecretConfigured,
    updatedAt: row?.updatedAt.toISOString() ?? null, webhookUrl: webhookUrl(), outboundEnabled: false,
  };
}

/** อ่านเฉพาะ singleton; ห้ามตีความ table หายหรืออ่านไม่ได้ว่าไม่มี row */
async function readRow() {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  return row;
}

/** Owner เห็นเพียงสถานะ; เมื่อ key หรือ ciphertext เสียให้หยุดโดยไม่เผยรายละเอียด */
export async function getLineProviderSettingsDto(actor: ActorContext): Promise<LineProviderSettingsDto> {
  requireOwner(actor);
  try {
    const row = await readRow();
    if (row) readDatabaseCredentials(row);
    else assertProviderConfigKey(process.env.PROVIDER_CONFIG_ENCRYPTION_KEY);
    return safeDto(row);
  } catch { throw new LineProviderSettingsError(503); }
}

/** ตรวจภายใต้ lock เฉพาะเมื่อเปลี่ยน OA; challenge หมดอายุที่ยังไม่ผูกลบได้ใน transaction เดียวกัน */
async function guardDestinationChange(tx: DbTransaction) {
  const now = new Date();
  await tx.delete(links).where(and(isNull(links.lineUserId), isNotNull(links.challengeHash), lte(links.challengeExpiresAt, now)));
  const [link] = await tx.select({ id: links.memberId }).from(links).where(or(isNotNull(links.lineUserId),
    and(isNotNull(links.challengeHash), gt(links.challengeExpiresAt, now)))).limit(1).for("update");
  if (link) throw new LineProviderSettingsError(409);
  const [unsent] = await tx.select({ id: notifications.id }).from(notifications)
    .where(and(eq(notifications.channel, "LINE"), ne(notifications.status, "SENT"))).limit(1).for("update");
  if (unsent) throw new LineProviderSettingsError(409);
}

/** แปลงเฉพาะรหัสชนกันของ MySQL โดยไม่อ่านข้อความ SQL ที่อาจมีข้อมูล credential */
function isWriteConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const cause = "cause" in error ? error.cause : null;
  return [error, cause].some(item => item && typeof item === "object" && "code" in item
    && (item.code === "ER_DUP_ENTRY" || item.code === "ER_LOCK_DEADLOCK"));
}

/** ใช้ revision และ SUCCESS audit ใน transaction เดียวเพื่อไม่ overwrite หรือบันทึกสำเร็จเพียงครึ่งเดียว */
export async function updateLineProviderSettings(actor: ActorContext, input: unknown): Promise<LineProviderSettingsDto> {
  requireOwner(actor);
  const parsed = patch.safeParse(input);
  if (!parsed.success) throw new LineProviderSettingsError(400);
  const value = parsed.data;
  const audit = { actorStaffId: actor.staffId, branchId: null, action: "LINE_PROVIDER_SETTINGS_UPDATED", entityType: "LINE_PROVIDER_SETTINGS", entityId: 1 };
  try {
    return await db.transaction(async tx => {
      const [row] = await tx.select().from(settings).where(eq(settings.id, 1)).limit(1).for("update");
      const key = process.env.PROVIDER_CONFIG_ENCRYPTION_KEY;
      if (row) readDatabaseCredentials(row);
      else assertProviderConfigKey(key);
      if (value.revision !== (row?.revision ?? 0) || value.revision === 0x7fffffff) throw new LineProviderSettingsError(409);
      const destination = value.destination ?? row?.destination;
      if (!destination || (!row && ((!value.accessToken && !value.clearAccessToken) || (!value.channelSecret && !value.clearChannelSecret)))) {
        throw new LineProviderSettingsError(400);
      }
      if (destination !== (row?.destination ?? process.env.NOTIFICATION_LINE_DESTINATION)) await guardDestinationChange(tx);
      const revision = value.revision + 1;
      const values = {
        destination, revision, updatedByStaffId: actor.staffId, updatedAt: new Date(Math.floor(Date.now() / 1000) * 1000),
        accessTokenEncrypted: value.accessToken ? encryptProviderCredential(value.accessToken, "accessToken", key) : value.clearAccessToken ? null : row.accessTokenEncrypted,
        channelSecretEncrypted: value.channelSecret ? encryptProviderCredential(value.channelSecret, "channelSecret", key) : value.clearChannelSecret ? null : row.channelSecretEncrypted,
      };
      if (row) {
        const [result] = await tx.update(settings).set(values).where(and(eq(settings.id, 1), eq(settings.revision, value.revision)));
        if (result.affectedRows !== 1) throw new LineProviderSettingsError(409);
      } else await tx.insert(settings).values({ id: 1, ...values });
      await writeAudit(tx, { ...audit, result: "SUCCESS", metadata: { source: "LINE", status: "UPDATED", revision } });
      return safeDto(values);
    }, { isolationLevel: "repeatable read" }); // ให้ locking read กัน phantom insert แม้ server ตั้งค่าเริ่มต้นเป็น READ COMMITTED
  } catch (error) {
    // บันทึกความล้มเหลวหลัง rollback โดยไม่พ่วงชื่อ field, destination หรือ error เดิม
    try { await writeAudit(db, { ...audit, result: "FAILED", metadata: { source: "LINE", status: "FAILED", revision: value.revision } }); } catch { /* ห้าม log raw SQL */ }
    if (error instanceof LineProviderSettingsError) throw error;
    throw new LineProviderSettingsError(isWriteConflict(error) ? 409 : 503);
  }
}

/** ใช้ env เฉพาะเมื่ออ่านยืนยันว่าไม่มี row; clear, tamper หรือ DB ล่มต้องไม่คืน secret เดิม */
export async function resolveLineWebhookCredentials(): Promise<{ channelSecret: string; destination?: string } | null> {
  try {
    const row = await readRow();
    if (row) {
      const { channelSecret, destination } = readDatabaseCredentials(row);
      return channelSecret ? { channelSecret, destination } : null;
    }
    const channelSecret = process.env.NOTIFICATION_LINE_CHANNEL_SECRET;
    const destination = process.env.NOTIFICATION_LINE_DESTINATION;
    if (!channelSecret || !credential.safeParse(channelSecret).success || (destination && !isLineUserId(destination))) return null;
    return destination ? { channelSecret, destination } : { channelSecret };
  } catch { return null; }
}

/** คืน token สำหรับ worker เท่านั้น; เมื่อมีแถวแล้ว การล้างค่าหรืออ่านไม่ได้ต้องไม่ย้อนกลับไปใช้ env */
export async function resolveLinePushToken(): Promise<string | undefined> {
  try {
    const row = await readRow();
    if (row) return readDatabaseCredentials(row).accessToken ?? undefined;
    const token = credential.safeParse(process.env.NOTIFICATION_LINE_ACCESS_TOKEN);
    const destination = process.env.NOTIFICATION_LINE_DESTINATION;
    return token.success && (!destination || isLineUserId(destination)) ? token.data : undefined;
  } catch { return undefined; }
}
