import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const HTTP_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);
const PUBLIC_METHODS = new Set([
  // อนุญาตเฉพาะ POST ที่ตรวจ HMAC ใน handler ไม่เปิด route ลูกหรือ method อื่น
  "app/api/line/webhook/route.ts:POST",
  "app/api/health/route.ts:GET",
  "app/api/auth/login/route.ts:POST",
  "app/api/auth/logout/route.ts:POST",
  "app/api/auth/change-password/route.ts:POST",
  "app/api/member-applications/route.ts:POST",
  "app/api/member-auth/login/route.ts:POST",
  "app/api/member-auth/logout/route.ts:POST",
]);
const GUARDED_IMPORTS = new Set([
  "@/lib/staff-service:requirePermission",
  "@/lib/auth/session-service:requireFullSession",
  "@/lib/staff-service:getStaffDashboard",
  "@/lib/branch-service:setCurrentBranchCookie",
  "@/lib/staff-service:setCurrentStaffCookie",
  "@/lib/member-auth/service:requireMemberSession",
  "@/lib/staff-service:getStaffContext",
]);

type ExportedMethod = { method: string; node: ts.Node | null };

/** เดินหา route.ts แบบ deterministic เพื่อให้ API ใหม่ทุกระดับถูกตรวจเสมอ */
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

function isExported(node: ts.Node) {
  return Boolean(
    ts.canHaveModifiers(node) &&
      ts.getModifiers(node)?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      ),
  );
}

/** ใช้ AST แยก direct export/local specifier และทำให้ HTTP re-export ที่ตรวจตัว handler ไม่ได้ถูกปฏิเสธโดยปริยาย */
function exportedMethods(source: string, fileName = "route.ts"): ExportedMethod[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const methods: ExportedMethod[] = [];
  const localHandlers = new Map<string, ts.Node>();
  for (const statement of file.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      localHandlers.set(statement.name.text, statement.body);
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        (ts.isArrowFunction(declaration.initializer) ||
          ts.isFunctionExpression(declaration.initializer)) &&
        ts.isBlock(declaration.initializer.body)
      ) {
        localHandlers.set(declaration.name.text, declaration.initializer.body);
      }
    }
  }
  for (const statement of file.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      isExported(statement) &&
      statement.name &&
      HTTP_METHODS.has(statement.name.text) &&
      statement.body
    ) {
      methods.push({ method: statement.name.text, node: statement.body });
      continue;
    }
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && HTTP_METHODS.has(declaration.name.text)) {
          methods.push({
            method: declaration.name.text,
            node: localHandlers.get(declaration.name.text) ?? null,
          });
        }
      }
      continue;
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      !statement.exportClause
    ) {
      // export-star ระบุ HTTP method ที่ส่งออกไม่ได้ จึงต้อง fail inventory แบบอนุรักษนิยมแทนการข้ามไฟล์
      methods.push({ method: "*", node: null });
      continue;
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const specifier of statement.exportClause.elements) {
        const method = specifier.name.text;
        if (!HTTP_METHODS.has(method)) continue;
        const localName = specifier.propertyName?.text ?? specifier.name.text;
        methods.push({
          method,
          node: statement.moduleSpecifier
            ? null
            : (localHandlers.get(localName) ?? null),
        });
      }
    }
  }
  return methods;
}

/** ผูก local import กับ module/export ต้นทาง เพื่อให้ชื่อฟังก์ชันปลอมใน route ไม่ผ่าน allowlist */
function importProvenance(source: string, fileName: string) {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const imports = new Map<string, string>();
  for (const statement of file.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) continue;
    for (const specifier of statement.importClause.namedBindings.elements) {
      imports.set(
        specifier.name.text,
        `${statement.moduleSpecifier.text}:${specifier.propertyName?.text ?? specifier.name.text}`,
      );
    }
  }
  return imports;
}

function callsGuard(node: ts.Node | null, provenance: Map<string, string>) {
  if (!node) return false;
  let guarded = false;
  function visit(current: ts.Node) {
    // guard ใน callback หรือฟังก์ชันย่อยที่ handler ไม่ได้เรียก ไม่ถือว่าป้องกัน request path
    if (
      current !== node &&
      (ts.isFunctionDeclaration(current) ||
        ts.isFunctionExpression(current) ||
        ts.isArrowFunction(current) ||
        ts.isMethodDeclaration(current))
    ) return;
    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      GUARDED_IMPORTS.has(provenance.get(current.expression.text) ?? "")
    ) guarded = true;
    if (!guarded) ts.forEachChild(current, visit);
  }
  visit(node);
  return guarded;
}

describe("protected API inventory", () => {
  it("parses sync/async declarations and const handlers including HEAD/OPTIONS without block bleed", () => {
    const source = `
      export function GET() { return Response.json({ ok: true }); }
      export async function HEAD() { await requireFullSession(); }
      export const OPTIONS = () => { return new Response(null); };
      export const POST = async function () { await requirePermission("x"); };
    `;
    expect(exportedMethods(source).map(({ method }) => method)).toEqual([
      "GET",
      "HEAD",
      "OPTIONS",
      "POST",
    ]);
  });

  it("resolves separately declared local export specifiers and flags HTTP re-exports as unsupported", () => {
    const local = `
      import { requireFullSession } from "@/lib/auth/session-service";
      const GET = async () => { await requireFullSession(); };
      export { GET };
    `;
    expect(exportedMethods(local).map(({ method }) => method)).toEqual(["GET"]);
    expect(callsGuard(exportedMethods(local)[0].node, importProvenance(local, "route.ts"))).toBe(true);

    const reexport = `export { handler as POST } from "./handler";`;
    expect(exportedMethods(reexport).map(({ method }) => method)).toEqual(["POST"]);
    expect(callsGuard(exportedMethods(reexport)[0].node, new Map())).toBe(false);
  });

  it("does not accept a canonical guard hidden inside an uninvoked nested function", () => {
    const source = `
      import { requireFullSession } from "@/lib/auth/session-service";
      export async function GET() {
        async function dead() { await requireFullSession(); }
        return Response.json({ ok: true });
      }
    `;
    const [handler] = exportedMethods(source);
    expect(callsGuard(handler.node, importProvenance(source, "route.ts"))).toBe(false);
  });

  it("flags export-star route handlers as unsupported instead of skipping them", () => {
    const source = `export * from "./handler";`;

    expect(exportedMethods(source)).toEqual([{ method: "*", node: null }]);
  });

  it("keeps every Route Handler behind an authoritative canonical guard or explicit public allowlist", () => {
    const apiRoot = path.join(process.cwd(), "app", "api");
    const unguarded: string[] = [];
    for (const file of listRouteFiles(apiRoot)) {
      const source = fs.readFileSync(file, "utf8");
      const relative = path.relative(process.cwd(), file).replaceAll("\\", "/");
      const provenance = importProvenance(source, file);
      for (const { method, node } of exportedMethods(source, file)) {
        const key = `${relative}:${method}`;
        if (!PUBLIC_METHODS.has(key) && !callsGuard(node, provenance)) {
          unguarded.push(key);
        }
      }
    }
    expect(unguarded).toEqual([]);
  });
});
