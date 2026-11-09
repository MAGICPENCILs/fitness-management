import { getTableColumns, getTableName, sql, SQL, type AnyColumn, type Table } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { auditLogs, consentEvents, memberLineLinks, members, notifications, notificationSettings } from "@/db/schema";

type Row = Record<string, unknown>;
type Condition = Parameters<MySqlDialect["sqlToQuery"]>[0];
const dialect = new MySqlDialect();

/** ประเมินเฉพาะ SQL predicates ที่ service ใช้ เพื่อให้ fixture ตรวจ WHERE/fence กับแถวจริง */
function matches(condition: Condition | undefined, row: Row, table: Table, member: Row) {
  if (!condition) return true;
  const query = dialect.sqlToQuery(condition);
  const tokens = query.sql.match(/`[^`]+`\.`[^`]+`|\?|<=|<>|=|<|\(|\)|,|\b(?:and|or|in|is|not|null)\b/gi) ?? [];
  let index = 0; let parameter = 0;
  const operand = (): unknown => {
    const token = tokens[index++];
    if (token === "?") return query.params[parameter++];
    const [, tableName, columnName] = /`([^`]+)`\.`([^`]+)`/.exec(token) ?? [];
    const target = tableName === "members" && table !== members ? member : row;
    const columns: Record<string, { name: string }> = getTableColumns(tableName === "members" ? members : table);
    const key = Object.keys(columns).find(key => columns[key].name === columnName);
    if (!key) throw new Error(`UNSUPPORTED_COLUMN ${token}`);
    return target[key];
  };
  const atom = (): boolean => {
    if (tokens[index] === "(") { index++; const result = expression(); index++; return result; }
    const left = operand(); const operator = tokens[index++];
    if (operator === "is") { const not = tokens[index] === "not"; if (not) index++; index++; return not ? left != null : left == null; }
    if (operator === "in") {
      index++; const values = [operand()];
      while (tokens[index] === ",") { index++; values.push(operand()); }
      index++; return values.includes(left);
    }
    const right = operand();
    const a = left instanceof Date ? left.getTime() : left as number;
    const b = right instanceof Date ? right.getTime() : left instanceof Date && typeof right === "string" ? new Date(`${right.replace(" ", "T")}Z`).getTime() : right as number;
    if (operator === "=") return a === b;
    if (operator === "<>") return a !== b;
    if (operator === "<") return a < b;
    if (operator === "<=") return a <= b;
    throw new Error(`UNSUPPORTED_OPERATOR ${operator}`);
  };
  const conjunction = (): boolean => { let result = atom(); while (tokens[index] === "and") { index++; const next = atom(); result = result && next; } return result; };
  const expression = (): boolean => { let result = conjunction(); while (tokens[index] === "or") { index++; const next = conjunction(); result = result || next; } return result; };
  const result = expression();
  if (index !== tokens.length || parameter !== query.params.length) throw new Error("UNCONSUMED_SQL");
  return result;
}

/** จำลอง DB boundary เท่านั้น; transaction serialize/rollback และ provider hook ควบคุม race แบบ deterministic */
export function notificationTestDb() {
  const now = new Date("2026-11-09T00:00:00Z");
  const state = {
    member: { id: 7, homeBranchId: 10, status: "ACTIVE" } as Row,
    links: [{ memberId: 7, branchId: 10, lineUserId: `U${"a".repeat(32)}`, linkedAt: now, challengeHash: null, challengeExpiresAt: null }] as Row[],
    events: [
      { id: 1, memberId: 7, consentType: "SERVICE_PRIVACY", action: "GRANTED", createdAt: now },
      { id: 2, memberId: 7, consentType: "MARKETING", action: "GRANTED", createdAt: now },
    ] as Row[],
    rows: [] as Row[], audits: [] as Row[], locks: [] as string[],
    active: false, failAudit: false,
    afterCommit: undefined as (() => Promise<void> | void) | undefined,
    beforeLock: undefined as ((table: Table) => void) | undefined,
    beforeRead: undefined as ((table: Table) => Promise<void> | void) | undefined,
  };
  const data = (table: Table) => {
    if (table === members) return [state.member];
    if (table === memberLineLinks) return state.links;
    if (table === consentEvents) return state.events;
    if (table === notifications) return state.rows;
    if (table === notificationSettings) return [{ id: 1, isActive: true, enableLine: true }];
    throw new Error(`UNEXPECTED_TABLE ${getTableName(table)}`);
  };
  const select = (projection?: Record<string, { name: string }>) => {
    let table: Table; let condition: Condition | undefined; let limit = Infinity; let ordering: SQL[] = [];
    const rows = async () => {
      if (!state.active) await state.beforeRead?.(table);
      let result = data(table).filter(row => matches(condition, row, table, state.member));
      if (ordering.length) result = result.slice().sort((a, b) => {
        for (const order of ordering) {
          const text = dialect.sqlToQuery(order).sql;
          const columnName = /`[^`]+`\.`([^`]+)`/.exec(text)?.[1];
          const columns = getTableColumns(table); const property = Object.keys(columns).find(name => columns[name].name === columnName);
          if (!property) throw new Error("UNSUPPORTED_ORDER");
          const difference = Number(a[property]) - Number(b[property]);
          if (difference) return text.endsWith("desc") ? -difference : difference;
        }
        return 0;
      });
      return result.slice(0, limit).map(row => projection ? Object.fromEntries(Object.entries(projection).map(([key, column]) => {
        const columns = getTableColumns(table); const property = Object.keys(columns).find(name => columns[name].name === column.name);
        return [key, row[property ?? key]];
      })) : { ...row });
    };
    const query = {
      from(value: Table) { table = value; return query; },
      where(value: Condition) { condition = value; return query; },
      limit(value: number) { limit = value; return query; }, innerJoin() { return query; }, orderBy(...values: (SQL | AnyColumn)[]) { ordering = values.map(value => value instanceof SQL ? value : sql`${value}`); return query; },
      async for() { state.beforeLock?.(table); state.locks.push(getTableName(table)); return rows(); },
      then(resolve: (value: Row[]) => unknown, reject: (error: unknown) => unknown) { return rows().then(resolve, reject); },
    };
    return query;
  };
  const update = (table: Table) => ({ set: (changes: Row) => ({ where: async (condition: Condition) => {
    const matching = data(table).filter(row => matches(condition, row, table, state.member));
    for (const row of matching) for (const [key, value] of Object.entries(changes)) row[key] = value instanceof SQL ? Number(row[key]) + 1 : value;
    return [{ affectedRows: matching.length }];
  } }) });
  const insert = (table: Table) => ({ values: async (row: Row) => {
    if (table === auditLogs) { if (state.failAudit) throw new Error("AUDIT_FAILED"); state.audits.push(row); }
    else if (table === memberLineLinks) state.links.push(row);
    else throw new Error("UNEXPECTED_INSERT");
    return [{ affectedRows: 1 }];
  } });
  const remove = (table: Table) => ({ where: async (condition: Condition) => {
    if (table !== memberLineLinks) throw new Error("UNEXPECTED_DELETE");
    state.links = state.links.filter(row => !matches(condition, row, table, state.member));
    return [{ affectedRows: 1 }];
  } });
  let tail = Promise.resolve();
  const transaction = async <T>(callback: (tx: unknown) => Promise<T>) => {
    const prior = tail; let release!: () => void; tail = new Promise<void>(resolve => { release = resolve; }); await prior;
    const snapshot = structuredClone({ member: state.member, links: state.links, events: state.events, rows: state.rows, audits: state.audits });
    state.active = true; state.locks = [];
    let result: T;
    try { result = await callback({ select, update, insert, delete: remove }); }
    catch (error) { Object.assign(state, snapshot); throw error; }
    finally { state.active = false; release(); }
    const hook = state.afterCommit; state.afterCommit = undefined; await hook?.(); return result;
  };
  return { state, db: { select, update, insert, transaction } };
}

/** สร้างแถวครบตาม schema เพื่อทดสอบ snapshot และ cancellation โดยไม่เชื่อมฐานข้อมูลจริง */
export function queuedNotification(overrides: Row = {}): Row {
  return { id: 1, memberId: 7, memberPackageId: null, type: "INACTIVITY", channel: "LINE", status: "QUEUED", failureKind: null, attemptCount: 0, recipient: `U${"a".repeat(32)}`, title: "private title", message: "private message", scheduledFor: "2026-11-09", dedupeKey: "test", errorMessage: null, sentAt: null, lastAttemptAt: null, createdAt: new Date("2026-11-09"), ...overrides };
}
