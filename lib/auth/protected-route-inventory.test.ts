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
  "app/api/auth/login/route.ts:POST",
  "app/api/auth/logout/route.ts:POST",
  "app/api/auth/change-password/route.ts:POST",
]);
const GUARDED_IMPORTS = new Set([
  "@/lib/staff-service:requirePermission",
  "@/lib/auth/session-service:requireFullSession",
  "@/lib/staff-service:getStaffDashboard",
  "@/lib/branch-service:setCurrentBranchCookie",
  "@/lib/staff-service:setCurrentStaffCookie",
]);

type ExportedMethod = { method: string; node: ts.Node };

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

/** ใช้ TypeScript AST แยก handler จริง จึงรองรับ sync/async declaration และ const arrow โดยไม่ให้ guard ของ method ข้างเคียงปนกัน */
function exportedMethods(source: string, fileName = "route.ts"): ExportedMethod[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const methods: ExportedMethod[] = [];
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
    if (!ts.isVariableStatement(statement) || !isExported(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        HTTP_METHODS.has(declaration.name.text) &&
        declaration.initializer &&
        (ts.isArrowFunction(declaration.initializer) ||
          ts.isFunctionExpression(declaration.initializer)) &&
        ts.isBlock(declaration.initializer.body)
      ) {
        methods.push({ method: declaration.name.text, node: declaration.initializer.body });
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

function callsGuard(node: ts.Node, provenance: Map<string, string>) {
  let guarded = false;
  function visit(current: ts.Node) {
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
